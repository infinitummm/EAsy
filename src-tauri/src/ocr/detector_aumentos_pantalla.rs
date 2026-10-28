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
    #[serde(rename = "posXPct")]
    pub pos_x_pct: f32,
    #[serde(rename = "posYPct")]
    pub pos_y_pct: f32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResultadoEscaneoAugments {
    pub cards: [ResultadoCartaOcr; 3],
    pub best_card_index: Option<u8>,
    pub detected_at: u64,
    pub is_analyzing: bool,
}

/// Coordenadas porcentuales normalizadas para las 3 columnas sobre la caja 16:9
/// Centros exactos: 0.295 (Carta 1), 0.500 (Carta 2), 0.705 (Carta 3)
pub const COLUMNAS_CARTAS: [(f32, f32); 3] = [
    (0.215, 0.375),  // Carta 1 (Izquierda)
    (0.420, 0.580),  // Carta 2 (Centro)
    (0.625, 0.785),  // Carta 3 (Derecha)
];

/// Sub-bandas verticales Y de título sobre la caja 16:9
/// Calibrado con capturas reales: el título ("Ominous Pact", "Glass Cannon", "Final Form") reside en y = 0.410 .. 0.460
pub const BANDAS_Y_TITULO: [(f32, f32); 2] = [
    (0.395, 0.468), // Banda Primaria exacta (Solo Título de la carta)
    (0.315, 0.472), // Banda Extendida (Título + margen superior/inferior)
];

/// Preprocesa el recorte aplicando escalado x3 suave (Triangle) e inversión de luminancia con estiramiento de contraste
pub fn preprocesar_recorte_suave_3x(recorte: &RgbaImage) -> RgbaImage {
    let nuevo_ancho = recorte.width() * 3;
    let nuevo_alto = recorte.height() * 3;
    let reescalado = imageops::resize(
        recorte,
        nuevo_ancho,
        nuevo_alto,
        imageops::FilterType::Triangle,
    );

    let mut dest: RgbaImage = ImageBuffer::new(nuevo_ancho, nuevo_alto);
    for (x, y, pixel) in reescalado.enumerate_pixels() {
        let lum = 0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32;
        // Estiramiento de contraste suave: fondo oscuro (< 65) -> 255 (blanco), letras claras (> 165) -> 0 (negro)
        let norm = ((lum - 65.0) / 100.0).clamp(0.0, 1.0);
        let inv = ((1.0 - norm) * 255.0).round() as u8;
        dest.put_pixel(x, y, Rgba([inv, inv, inv, 255]));
    }
    dest
}

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

/// Empareja un texto crudo de OCR contra el catálogo de aumentos usando matching de líneas y Damerau-Levenshtein
pub fn emparejar_aumento_en_catalogo(
    texto_crudo: &str,
    catalogo: &[AumentoCatalogo],
    rareza_visual: Option<&str>,
) -> (Option<AumentoCatalogo>, f64) {
    if texto_crudo.trim().is_empty() {
        return (None, 0.0);
    }

    let lineas: Vec<String> = texto_crudo
        .lines()
        .map(|l| limpiar_texto_ocr(l).to_lowercase())
        .filter(|l| l.len() >= 4 && l.chars().filter(|c| c.is_alphabetic()).count() >= 4)
        .collect();

    if lineas.is_empty() {
        return (None, 0.0);
    }

    let texto_completo = limpiar_texto_ocr(texto_crudo).to_lowercase();

    let mut mejor_aumento: Option<AumentoCatalogo> = None;
    let mut mejor_score = 0.0f64;

    for item in catalogo {
        let name_en = item.name.trim().to_lowercase();
        let name_es = item.name_es.as_deref().unwrap_or("").trim().to_lowercase();

        // Ignorar entradas vacías o placeholders internos de Riot
        if name_en.len() < 3 || name_es.contains("blankname") || name_es.contains("_generic_") {
            continue;
        }

        let mut item_max_sim = 0.0f64;

        // 1. Evaluar coincidencia línea por línea (el título de la carta siempre está en su propia línea)
        for linea in &lineas {
            let sim_en = normalized_damerau_levenshtein(linea, &name_en);
            let sim_es = if !name_es.is_empty() {
                normalized_damerau_levenshtein(linea, &name_es)
            } else {
                0.0
            };

            // Contención de subcadena estricta: solo si el nombre real aparece completo (>= 5 chars)
            // o si la línea leída tiene >= 8 caracteres y cubre al menos el 70% del nombre del aumento
            let contiene_en = if (name_en.len() >= 5 && linea.contains(&name_en))
                || (linea.len() >= 8
                    && linea.len() * 10 >= name_en.len() * 7
                    && name_en.contains(linea.as_str()))
            {
                0.88
            } else {
                0.0
            };

            let contiene_es = if !name_es.is_empty()
                && ((name_es.len() >= 5 && linea.contains(&name_es))
                    || (linea.len() >= 8
                        && linea.len() * 10 >= name_es.len() * 7
                        && name_es.contains(linea.as_str())))
            {
                0.88
            } else {
                0.0
            };

            let linea_best = sim_en.max(sim_es).max(contiene_en).max(contiene_es);
            if linea_best > item_max_sim {
                item_max_sim = linea_best;
            }
        }

        // 2. Si las 2 primeras líneas se combinaron (título de 2 renglones)
        if lineas.len() >= 2 {
            let combinadas = format!("{} {}", lineas[0], lineas[1]);
            let sim_en = normalized_damerau_levenshtein(&combinadas, &name_en);
            let sim_es = if !name_es.is_empty() {
                normalized_damerau_levenshtein(&combinadas, &name_es)
            } else {
                0.0
            };
            if sim_en > item_max_sim {
                item_max_sim = sim_en;
            }
            if sim_es > item_max_sim {
                item_max_sim = sim_es;
            }
        }

        // 3. Contención exacta del nombre completo (>= 6 caracteres) en el texto
        if name_en.len() >= 6 && texto_completo.contains(&name_en) {
            item_max_sim = item_max_sim.max(0.85);
        }
        if name_es.len() >= 6 && texto_completo.contains(&name_es) {
            item_max_sim = item_max_sim.max(0.85);
        }

        let refuerzo_rareza = if let (Some(r_vis), Some(r_cat)) = (rareza_visual, item.rarity.as_deref()) {
            if r_vis.eq_ignore_ascii_case(r_cat) { 0.05 } else { 0.0 }
        } else {
            0.0
        };

        let score_final = item_max_sim + refuerzo_rareza;
        if score_final > mejor_score {
            mejor_score = score_final;
            mejor_aumento = Some(item.clone());
        }
    }

    // Umbral estricto para evitar que ruido del mapa coincida con aumentos reales
    let umbral_minimo = 0.72;
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

/// Escanea una sola carta (índice 0, 1 o 2) en pantalla para actualización ultrarrápida tras un Reroll
pub fn escanear_carta_individual_en_pantalla(
    img: &RgbaImage,
    caja16a9: crate::ocr::detector_panel_aumentos::Rectangulo,
    idx: usize,
    pos_x_pct: f32,
    pos_y_pct: f32,
    catalogo: &[AumentoCatalogo],
    aumentos_campeon: Option<&[InfoAumento]>,
) -> ResultadoCartaOcr {
    let card_index = (idx + 1) as u8;
    let (x_min_f, x_max_f) = COLUMNAS_CARTAS[idx];

    let crop_x = (caja16a9.x as f32 + x_min_f * caja16a9.width as f32).round() as u32;
    let crop_w = ((x_max_f - x_min_f) * caja16a9.width as f32).round() as u32;

    // Banda Primaria exacta del título (0.395 a 0.468)
    let y_min_p = BANDAS_Y_TITULO[0].0;
    let y_max_p = BANDAS_Y_TITULO[0].1;
    let crop_y_p = (caja16a9.y as f32 + y_min_p * caja16a9.height as f32).round() as u32;
    let crop_h_p = ((y_max_p - y_min_p) * caja16a9.height as f32).round() as u32;

    let safe_x = crop_x.min(img.width().saturating_sub(1));
    let safe_w = crop_w.min(img.width().saturating_sub(safe_x));
    let safe_y_p = crop_y_p.min(img.height().saturating_sub(1));
    let safe_h_p = crop_h_p.min(img.height().saturating_sub(safe_y_p));

    if safe_w < 10 || safe_h_p < 10 {
        return ResultadoCartaOcr {
            card_index,
            augment: None,
            raw_text: String::new(),
            confidence: 0.0,
            crop_preview_data_url: None,
            error: Some("Área de recorte inválida".to_string()),
            pos_x_pct,
            pos_y_pct,
        };
    }

    // Pasada 1: Recorte primario de título con escalado suave x3
    let recorte_primario = imageops::crop_imm(img, safe_x, safe_y_p, safe_w, safe_h_p).to_image();
    let prep_suave = preprocesar_recorte_suave_3x(&recorte_primario);
    let mut mejor_raw_text = String::new();
    let mut mejor_match: Option<AumentoCatalogo> = None;
    let mut mejor_conf = 0.0f64;
    let mut ultimo_err: Option<String> = None;

    match reconocer_texto_windows_ocr(&prep_suave) {
        Ok(txt) => {
            let (m, c) = emparejar_aumento_en_catalogo(&txt, catalogo, None);
            mejor_raw_text = txt;
            mejor_match = m;
            mejor_conf = c;
        }
        Err(e) => {
            ultimo_err = Some(e);
        }
    }

    // Pasada 2 (Fallback): Si la confianza es < 0.78, probar banda extendida con binarización adaptativa x3
    if mejor_conf < 0.78 {
        let y_min_e = BANDAS_Y_TITULO[1].0;
        let y_max_e = BANDAS_Y_TITULO[1].1;
        let crop_y_e = (caja16a9.y as f32 + y_min_e * caja16a9.height as f32).round() as u32;
        let crop_h_e = ((y_max_e - y_min_e) * caja16a9.height as f32).round() as u32;
        let safe_y_e = crop_y_e.min(img.height().saturating_sub(1));
        let safe_h_e = crop_h_e.min(img.height().saturating_sub(safe_y_e));

        if safe_h_e >= 10 {
            let recorte_ext = imageops::crop_imm(img, safe_x, safe_y_e, safe_w, safe_h_e).to_image();
            let prep_bin = preprocesar_recorte_invertido(&recorte_ext, 3);
            if let Ok(txt2) = reconocer_texto_windows_ocr(&prep_bin) {
                let (m2, c2) = emparejar_aumento_en_catalogo(&txt2, catalogo, None);
                if c2 > mejor_conf {
                    mejor_raw_text = txt2;
                    mejor_match = m2;
                    mejor_conf = c2;
                }
            }
        }
    }

    let augment_info = mejor_match.map(|c| {
        let tier_por_rareza = match c.rarity.as_deref().unwrap_or("silver") {
            "prismatic" => "S".to_string(),
            "gold" => "B".to_string(),
            _ => "C".to_string(),
        };

        let (tier_calc, pick_rate_calc, win_rate_calc) = if let Some(stats) = aumentos_campeon {
            if let Some(encontrado) = stats.iter().find(|a| {
                a.id == c.id
                    || a.name.eq_ignore_ascii_case(&c.name)
                    || (a.name_es.is_some() && a.name_es == c.name_es)
            }) {
                (
                    encontrado.tier.clone().or(Some(tier_por_rareza)),
                    encontrado.pick_rate,
                    encontrado.win_rate,
                )
            } else {
                (Some(tier_por_rareza), None, None)
            }
        } else {
            (Some(tier_por_rareza), None, None)
        };

        InfoAumento {
            id: c.id,
            key: c.key,
            name: c.name,
            name_es: c.name_es,
            rarity: c.rarity,
            icon_url: c.icon_url,
            desc: c.desc,
            desc_es: c.desc_es,
            tier: tier_calc,
            pick_rate: pick_rate_calc,
            win_rate: win_rate_calc,
        }
    });

    ResultadoCartaOcr {
        card_index,
        augment: augment_info,
        raw_text: mejor_raw_text,
        confidence: mejor_conf,
        crop_preview_data_url: None,
        error: if mejor_conf > 0.0 { None } else { ultimo_err },
        pos_x_pct,
        pos_y_pct,
    }
}

/// Calcula el índice (1, 2 o 3) del mejor aumento entre las 3 cartas según tier y winRate de OP.GG
pub fn recalcular_mejor_carta(cartas: &[ResultadoCartaOcr; 3]) -> Option<u8> {
    let mut best_card_index = None;
    let mut max_score = -1.0f64;

    fn calcular_peso_tier(tier: Option<&str>, win_rate: Option<f64>) -> f64 {
        let base_tier = match tier {
            Some("S+") | Some("S") => 90.0,
            Some("A") => 75.0,
            Some("B") => 60.0,
            Some("C") => 45.0,
            Some("D") => 30.0,
            Some("F") => 15.0,
            _ => 50.0,
        };
        if let Some(wr) = win_rate {
            base_tier * 0.4 + wr * 0.6
        } else {
            base_tier
        }
    }

    for c in cartas {
        if let Some(aug) = &c.augment {
            let score = calcular_peso_tier(aug.tier.as_deref(), aug.win_rate);
            if score > max_score {
                max_score = score;
                best_card_index = Some(c.card_index);
            }
        }
    }

    best_card_index
}

/// Realiza el escaneo completo de las 3 cartas visibles en pantalla
pub fn escanear_tres_cartas_en_pantalla(
    img: &RgbaImage,
    caja16a9: crate::ocr::detector_panel_aumentos::Rectangulo,
    catalogo: &[AumentoCatalogo],
    aumentos_campeon: Option<&[InfoAumento]>,
) -> ResultadoEscaneoAugments {
    let coords_exactas = crate::ocr::detector_panel_aumentos::detectar_coordenadas_exactas_cartas(img, caja16a9);
    let c0 = escanear_carta_individual_en_pantalla(
        img,
        caja16a9,
        0,
        coords_exactas[0].0,
        coords_exactas[0].1,
        catalogo,
        aumentos_campeon,
    );
    let c1 = escanear_carta_individual_en_pantalla(
        img,
        caja16a9,
        1,
        coords_exactas[1].0,
        coords_exactas[1].1,
        catalogo,
        aumentos_campeon,
    );
    let c2 = escanear_carta_individual_en_pantalla(
        img,
        caja16a9,
        2,
        coords_exactas[2].0,
        coords_exactas[2].1,
        catalogo,
        aumentos_campeon,
    );

    let cards = [c0, c1, c2];
    let best_card_index = recalcular_mejor_carta(&cards);

    let detected_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    ResultadoEscaneoAugments {
        cards,
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

    #[test]
    fn test_emparejamiento_cartas_reales_screenshot_multilinea() {
        let catalogo: Vec<AumentoCatalogo> = serde_json::from_str(CATALOGO_AUMENTOS_RAW).unwrap();

        // Carta 1: Spin Me Right Round
        let raw_c1 = "Spin Me Right Round\nGeneral\nReplace a Summoner Spell with Heroic Swing.";
        let (match_c1, score_c1) = emparejar_aumento_en_catalogo(raw_c1, &catalogo, Some("silver"));
        assert!(match_c1.is_some(), "Debe emparejar Spin Me Right Round");
        assert_eq!(match_c1.unwrap().name, "Spin Me Right Round");
        assert!(score_c1 >= 0.85);

        // Carta 2: Kill Secured
        let raw_c2 = "Kill Secured\nSpeed\nGain increased Movement Speed towards enemies at low Health.";
        let (match_c2, score_c2) = emparejar_aumento_en_catalogo(raw_c2, &catalogo, Some("silver"));
        assert!(match_c2.is_some(), "Debe emparejar Kill Secured");
        assert_eq!(match_c2.unwrap().name, "Kill Secured");
        assert!(score_c2 >= 0.85);

        // Carta 3: Veil of Warding
        let raw_c3 = "Veil of Warding\nUtility\nGain a Spell Shield every 30 seconds that blocks the next enemy Ability.";
        let (match_c3, score_c3) = emparejar_aumento_en_catalogo(raw_c3, &catalogo, Some("silver"));
        assert!(match_c3.is_some(), "Debe emparejar Veil of Warding");
        assert_eq!(match_c3.unwrap().name, "Veil of Warding");
        assert!(score_c3 >= 0.85);
    }

    #[test]
    fn test_rechazo_ruido_ocr_corto_sin_falso_positivo_yunque() {
        let catalogo: Vec<AumentoCatalogo> = serde_json::from_str(CATALOGO_AUMENTOS_RAW).unwrap();

        // Fragmentos cortos de ruido que antes activaban `name_es.contains(linea)` contra "Obtienes 1 yunque de estadísticas"
        for ruido in ["obt", "1 y", "est", "de ", "uno", "110 743", "enemy", "slain"] {
            let (m, score) = emparejar_aumento_en_catalogo(ruido, &catalogo, None);
            assert!(
                m.is_none(),
                "El fragmento de ruido '{}' no debe emparejar ningún aumento (emparejó {:?} con score {})",
                ruido,
                m.map(|x| x.name),
                score
            );
        }
    }
}
