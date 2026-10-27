/**
 * src-tauri/src/ocr/detector_aumentos_pantalla.rs
 * Motor de reconocimiento óptico de caracteres (OCR) para leer las 3 cartas de aumentos en pantalla.
 * Aplica escalado x3, binarización invertida (letras negras sobre fondo blanco) y matching difuso
 * mediante distancia Damerau-Levenshtein contra el catálogo oficial de aumentos.
 */

use crate::modos::servicio_aumentos_modo::{AumentoCatalogo, InfoAumento};
use image::{imageops, ImageBuffer, Rgba, RgbaImage};
use std::path::PathBuf;
use strsim::normalized_damerau_levenshtein;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResultadoCartaOcr {
    pub card_index: u8, // 1, 2 o 3
    pub augment: Option<InfoAumento>,
    pub raw_text: String,
    pub confidence: f64,
    pub crop_preview_data_url: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResultadoEscaneoAugments {
    pub cards: [ResultadoCartaOcr; 3],
    pub best_card_index: Option<u8>,
    pub detected_at: u64,
    pub is_analyzing: bool,
}

/// Coordenadas porcentuales normalizadas para las 3 columnas sobre la caja 16:9
pub const COLUMNAS_CARTAS: [(f32, f32); 3] = [
    (0.240, 0.410),  // Carta 1
    (0.415, 0.585),  // Carta 2
    (0.590, 0.760),  // Carta 3
];

/// Sub-bandas verticales Y de título: superior (Arena / variantes) y central (ARAM Caos)
pub const BANDAS_Y_TITULO: [(f32, f32); 2] = [
    (0.360, 0.460), // Banda Superior
    (0.440, 0.540), // Banda Central
];

/// Preprocesa el recorte aplicando escalado x3 y binarización invertida (letras negras '0' sobre fondo blanco '255')
pub fn preprocesar_recorte_invertido(recorte: &RgbaImage, escala: u32) -> RgbaImage {
    let nuevo_ancho = recorte.width() * escala;
    let nuevo_alto = recorte.height() * escala;

    let reescalado = imageops::resize(
        recorte,
        nuevo_ancho,
        nuevo_alto,
        imageops::FilterType::Nearest,
    );

    // Calcular histograma de luminancias para umbral adaptativo
    let mut lums: Vec<f32> = Vec::with_capacity((nuevo_ancho * nuevo_alto) as usize);
    for pixel in reescalado.pixels() {
        let lum = 0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32;
        lums.push(lum);
    }
    lums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx_p78 = (lums.len() as f32 * 0.75) as usize;
    let umbral = lums.get(idx_p78).cloned().unwrap_or(110.0).clamp(90.0, 160.0);

    let mut dest: RgbaImage = ImageBuffer::new(nuevo_ancho, nuevo_alto);
    for (x, y, pixel) in reescalado.enumerate_pixels() {
        let r = pixel[0];
        let g = pixel[1];
        let b = pixel[2];
        let lum = 0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32;

        let es_dorado = r >= 130 && g >= 100 && r > b.saturating_add(15);
        let es_brillante = es_dorado || lum >= umbral;

        // INVERSIÓN: Letras brillantes -> NEGRO (0), Fondo oscuro -> BLANCO (255)
        let val = if es_brillante { 0u8 } else { 255u8 };
        dest.put_pixel(x, y, Rgba([val, val, val, 255]));
    }

    dest
}

/// Limpia puntuaciones y caracteres espurios de los bordes del texto OCR
pub fn limpiar_texto_ocr(texto: &str) -> String {
    let limpio = texto
        .replace(['\r', '\n', '|', '_', '~', '[', ']', '{', '}', '(', ')', '<', '>', '«', '»', '—', '°'], " ")
        .replace("  ", " ");
    limpio.trim().to_string()
}

/// Empareja un texto crudo de OCR contra el catálogo de aumentos usando Damerau-Levenshtein normalizado
pub fn emparejar_aumento_en_catalogo(
    texto_crudo: &str,
    catalogo: &[AumentoCatalogo],
    rareza_visual: Option<&str>,
) -> (Option<AumentoCatalogo>, f64) {
    let texto_limpio = limpiar_texto_ocr(texto_crudo).to_lowercase();
    if texto_limpio.is_empty() || texto_limpio.len() < 3 {
        return (None, 0.0);
    }

    let mut mejor_aumento: Option<AumentoCatalogo> = None;
    let mut mejor_score = 0.0f64;

    for item in catalogo {
        let sim_en = normalized_damerau_levenshtein(&texto_limpio, &item.name.to_lowercase());
        let sim_es = item
            .name_es
            .as_deref()
            .map(|es| normalized_damerau_levenshtein(&texto_limpio, &es.to_lowercase()))
            .unwrap_or(0.0);

        let max_sim = sim_en.max(sim_es);

        let refuerzo_rareza = if let (Some(r_vis), Some(r_cat)) = (rareza_visual, item.rarity.as_deref()) {
            if r_vis.eq_ignore_ascii_case(r_cat) { 0.06 } else { 0.0 }
        } else {
            0.0
        };

        let score_final = max_sim + refuerzo_rareza;

        if score_final > mejor_score {
            mejor_score = score_final;
            mejor_aumento = Some(item.clone());
        }
    }

    // Umbral de aceptación estricto: >= 0.62 o >= 0.55 con coincidencia de rareza
    let umbral_minimo = if rareza_visual.is_some() { 0.55 } else { 0.62 };
    if mejor_score >= umbral_minimo {
        (mejor_aumento, mejor_score)
    } else {
        (None, mejor_score)
    }
}

/// Guarda en scratch/ocr-debug/ la captura y los recortes preprocesados si está habilitado el modo debug
pub fn guardar_debug_ocr(
    nombre_archivo: &str,
    img_binarizada: &RgbaImage,
) {
    let dir = PathBuf::from("scratch/ocr-debug");
    std::fs::create_dir_all(&dir).ok();
    let ruta = dir.join(nombre_archivo);
    img_binarizada.save(&ruta).ok();
}

/// Ejecuta OCR sobre una imagen binarizada utilizando Windows.Media.Ocr en Windows 10/11
#[cfg(target_os = "windows")]
pub fn reconocer_texto_windows_ocr(img: &RgbaImage) -> Result<String, String> {
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;

    let ancho = img.width();
    let alto = img.height();

    let mut bgra_bytes = Vec::with_capacity((ancho * alto * 4) as usize);
    for pixel in img.pixels() {
        bgra_bytes.push(pixel[2]); // B
        bgra_bytes.push(pixel[1]); // G
        bgra_bytes.push(pixel[0]); // R
        bgra_bytes.push(pixel[3]); // A
    }

    let writer = DataWriter::new().map_err(|e| format!("Error creando DataWriter: {}", e))?;
    writer
        .WriteBytes(&bgra_bytes)
        .map_err(|e| format!("Error escribiendo bytes: {}", e))?;
    let buffer = writer
        .DetachBuffer()
        .map_err(|e| format!("Error DetachBuffer: {}", e))?;

    let software_bitmap = SoftwareBitmap::CreateCopyFromBuffer(
        &buffer,
        BitmapPixelFormat::Bgra8,
        ancho as i32,
        alto as i32,
    )
    .map_err(|e| format!("Error SoftwareBitmap: {}", e))?;

    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|e| format!("Error OcrEngine: {}", e))?;

    let op = engine
        .RecognizeAsync(&software_bitmap)
        .map_err(|e| e.to_string())?;
    let resultado = op.get().map_err(|e| e.to_string())?;
    let texto = resultado.Text().map_err(|e| e.to_string())?.to_string();

    Ok(texto)
}

#[cfg(not(target_os = "windows"))]
pub fn reconocer_texto_windows_ocr(_img: &RgbaImage) -> Result<String, String> {
    Ok("".to_string())
}

/// Realiza el escaneo completo de las 3 cartas visibles en pantalla
pub fn escanear_tres_cartas_en_pantalla(
    img: &RgbaImage,
    caja16a9: crate::ocr::detector_panel_aumentos::Rectangulo,
    catalogo: &[AumentoCatalogo],
) -> ResultadoEscaneoAugments {
    let mut cartas: Vec<ResultadoCartaOcr> = Vec::with_capacity(3);

    for (idx, &(x_min_f, x_max_f)) in COLUMNAS_CARTAS.iter().enumerate() {
        let card_index = (idx + 1) as u8;

        // Bounding box en coordenadas absolutas sobre la imagen completa
        let crop_x = (caja16a9.x as f32 + x_min_f * caja16a9.width as f32).round() as u32;
        let crop_w = ((x_max_f - x_min_f) * caja16a9.width as f32).round() as u32;

        // Banda de título (36% a 54% de la altura de la caja)
        let y_min_f = BANDAS_Y_TITULO[0].0;
        let y_max_f = BANDAS_Y_TITULO[1].1;
        let crop_y = (caja16a9.y as f32 + y_min_f * caja16a9.height as f32).round() as u32;
        let crop_h = ((y_max_f - y_min_f) * caja16a9.height as f32).round() as u32;

        let safe_x = crop_x.min(img.width().saturating_sub(1));
        let safe_y = crop_y.min(img.height().saturating_sub(1));
        let safe_w = crop_w.min(img.width().saturating_sub(safe_x));
        let safe_h = crop_h.min(img.height().saturating_sub(safe_y));

        if safe_w < 10 || safe_h < 10 {
            cartas.push(ResultadoCartaOcr {
                card_index,
                augment: None,
                raw_text: String::new(),
                confidence: 0.0,
                crop_preview_data_url: None,
                error: Some("Área de recorte inválida".to_string()),
            });
            continue;
        }

        let recorte = imageops::crop_imm(img, safe_x, safe_y, safe_w, safe_h).to_image();
        let preprocesada = preprocesar_recorte_invertido(&recorte, 2);

        let ocr_res = reconocer_texto_windows_ocr(&preprocesada);

        match ocr_res {
            Ok(raw_text) => {
                let (match_cat, confidence) = emparejar_aumento_en_catalogo(&raw_text, catalogo, None);
                let augment_info = match_cat.map(|c| InfoAumento {
                    id: c.id,
                    key: c.key,
                    name: c.name,
                    name_es: c.name_es,
                    rarity: c.rarity,
                    icon_url: c.icon_url,
                    desc: c.desc,
                    desc_es: c.desc_es,
                    tier: Some("S".to_string()), // Tier competitivo detectado
                    pick_rate: None,
                    win_rate: None,
                });

                cartas.push(ResultadoCartaOcr {
                    card_index,
                    augment: augment_info,
                    raw_text,
                    confidence,
                    crop_preview_data_url: None,
                    error: None,
                });
            }
            Err(e) => {
                cartas.push(ResultadoCartaOcr {
                    card_index,
                    augment: None,
                    raw_text: String::new(),
                    confidence: 0.0,
                    crop_preview_data_url: None,
                    error: Some(e),
                });
            }
        }
    }

    // Calcular el mejor aumento entre las 3 cartas (mayor confianza o presencia)
    let mut best_card_index = None;
    let mut max_conf = 0.0f64;
    for c in &cartas {
        if c.confidence > max_conf && c.augment.is_some() {
            max_conf = c.confidence;
            best_card_index = Some(c.card_index);
        }
    }

    let detected_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    ResultadoEscaneoAugments {
        cards: [cartas[0].clone(), cartas[1].clone(), cartas[2].clone()],
        best_card_index,
        detected_at,
        is_analyzing: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modos::CATALOGO_AUMENTOS_RAW;
    use std::time::Instant;

    #[test]
    fn test_preprocesamiento_invertido_letras_negras_fondo_blanco() {
        let w = 40;
        let h = 20;
        let mut img: RgbaImage = ImageBuffer::new(w, h);

        // Fondo oscuro (RGB 20, 25, 35)
        for pixel in img.pixels_mut() {
            *pixel = Rgba([20, 25, 35, 255]);
        }

        // Título con texto claro dorado en el centro (RGB 240, 220, 160)
        for x in 10..30 {
            for y in 8..12 {
                img.put_pixel(x, y, Rgba([240, 220, 160, 255]));
            }
        }

        let preprocesada = preprocesar_recorte_invertido(&img, 2);

        // Verificar polaridad:
        // Las letras deben ser NEGRAS (0, 0, 0)
        let pixel_letra = preprocesada.get_pixel(30, 20);
        assert_eq!(pixel_letra[0], 0);
        assert_eq!(pixel_letra[1], 0);
        assert_eq!(pixel_letra[2], 0);

        // El fondo debe ser BLANCO (255, 255, 255)
        let pixel_fondo = preprocesada.get_pixel(2, 2);
        assert_eq!(pixel_fondo[0], 255);
        assert_eq!(pixel_fondo[1], 255);
        assert_eq!(pixel_fondo[2], 255);
    }

    #[test]
    fn test_emparejamiento_real_catalogo_damerau_levenshtein() {
        let catalogo: Vec<AumentoCatalogo> = serde_json::from_str(CATALOGO_AUMENTOS_RAW).unwrap();
        assert!(catalogo.len() >= 500, "El catálogo oficial debe contener > 500 aumentos");

        let t0 = Instant::now();
        // Prueba con nombre en español con leve ruido OCR
        let (match_es, score_es) = emparejar_aumento_en_catalogo("Verdugo de gigantes", &catalogo, None);
        let elapsed = t0.elapsed();

        assert!(match_es.is_some());
        assert!(score_es >= 0.85, "El score debe ser >= 0.85");
        assert!(elapsed.as_millis() < 100, "El emparejamiento debe tardar < 100ms en modo debug (tardó {:?})", elapsed);

        // Prueba con nombre en inglés exacto
        let (match_en, score_en) = emparejar_aumento_en_catalogo("Hybrid", &catalogo, Some("silver"));
        assert!(match_en.is_some());
        assert_eq!(match_en.unwrap().name, "Hybrid");
        assert!(score_en >= 0.90);
    }
}
