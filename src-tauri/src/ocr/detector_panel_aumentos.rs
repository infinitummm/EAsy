/**
 * src-tauri/src/ocr/detector_panel_aumentos.rs
 * Detector ultraligero del panel de aumentos en pantalla para ARAM Caos y Arena (RF-1).
 * Implementa el Filtro Anti-Pantalla de Muerte de ARAM, rechazo de Tienda/Tabulador y detección de Reroll con dHash.
 */

use image::{GenericImageView, Rgba};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoMuestra {
    FondoCarta,
    HuecoInterCarta,
    BordeRareza,
    BotonReroll,
    Entorno,
}

#[derive(Debug, Clone, Copy)]
pub struct ColorRgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl ColorRgb {
    pub fn new(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b }
    }

    pub fn luminancia(&self) -> f32 {
        0.299 * self.r as f32 + 0.587 * self.g as f32 + 0.114 * self.b as f32
    }

    pub fn saturacion_cromatica(&self) -> u8 {
        let max = self.r.max(self.g).max(self.b);
        let min = self.r.min(self.g).min(self.b);
        max - min
    }
}

#[derive(Debug, Clone, Copy)]
pub struct MuestraRoi {
    pub tipo: TipoMuestra,
    pub color: ColorRgb,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rectangulo {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Normaliza las coordenadas a proporción 16:9 centrada para soportar pantallas 1080p, 1440p, 4K y Ultrawide 21:9
pub fn calcular_caja_16_a_9(ancho_total: u32, alto_total: u32) -> Rectangulo {
    let prop_actual = ancho_total as f32 / alto_total as f32;
    let prop_16_9 = 16.0 / 9.0;

    if (prop_actual - prop_16_9).abs() < 0.01 {
        Rectangulo {
            x: 0,
            y: 0,
            width: ancho_total,
            height: alto_total,
        }
    } else if prop_actual > prop_16_9 {
        // Pantalla Ultrawide (21:9 o 32:9): bandas negras a los costados
        let target_width = (alto_total as f32 * prop_16_9).round() as u32;
        let offset_x = (ancho_total - target_width) / 2;
        Rectangulo {
            x: offset_x,
            y: 0,
            width: target_width,
            height: alto_total,
        }
    } else {
        // Pantalla 16:10 u otra: bandas negras arriba y abajo
        let target_height = (ancho_total as f32 / prop_16_9).round() as u32;
        let offset_y = (alto_total - target_height) / 2;
        Rectangulo {
            x: 0,
            y: offset_y,
            width: ancho_total,
            height: target_height,
        }
    }
}

/// Centros horizontales exactos de las 3 cartas de aumentos sobre la caja normalizada 16:9
pub const CENTROS_X_CARTAS: [f32; 3] = [0.295, 0.500, 0.705];

/// Pasillos verticales inter-cartas (huecos entre Carta 1-2 y Carta 2-3)
pub const HUECOS_X_CARTAS: [f32; 2] = [0.397, 0.603];

/// Función pura que evalúa si las muestras corresponden inequívocamente al panel de aumentos
pub fn evaluar_visibilidad_panel(muestras: &[MuestraRoi]) -> bool {
    if muestras.is_empty() {
        return false;
    }

    // 1. REGLA OBLIGATORIA ANTI-MUERTE:
    // Al morir en LoL, la pantalla se desatura a escala de grises.
    let mut desaturadas = 0;
    let mut max_sat = 0u8;
    for m in muestras {
        let sat = m.color.saturacion_cromatica();
        if sat > max_sat {
            max_sat = sat;
        }
        let diff_rg = (m.color.r as i16 - m.color.g as i16).abs();
        let diff_gb = (m.color.g as i16 - m.color.b as i16).abs();
        let diff_rb = (m.color.r as i16 - m.color.b as i16).abs();
        if diff_rg < 8 && diff_gb < 8 && diff_rb < 8 {
            desaturadas += 1;
        }
    }

    let proporcion_desaturadas = desaturadas as f32 / muestras.len() as f32;
    if proporcion_desaturadas > 0.85 || max_sat < 12 {
        return false;
    }

    // 2. REGLA DE FONDOS OSCUROS UNIFORMES DE LAS 3 CARTAS (luminancia <= 62.0 y sin azul brillante de hielo ARAM)
    let fondos: Vec<&MuestraRoi> = muestras.iter().filter(|m| m.tipo == TipoMuestra::FondoCarta).collect();
    let mut fondos_oscuros = 0;
    let mut min_lum_oscuro = 255.0f32;
    let mut max_lum_oscuro = 0.0f32;

    for f in &fondos {
        let lum = f.color.luminancia();
        // El interior de la carta es gris/azul muy oscuro (b <= 85, lum <= 62.0)
        if lum <= 62.0 && f.color.b <= 85 {
            fondos_oscuros += 1;
            if lum < min_lum_oscuro {
                min_lum_oscuro = lum;
            }
            if lum > max_lum_oscuro {
                max_lum_oscuro = lum;
            }
        }
    }

    // Las 3 cartas tienen el mismo fondo oscuro uniforme (diferencia máxima de luminancia <= 26)
    let min_fondos_requeridos = if fondos.len() >= 6 { 4 } else { 2 };
    let uniformidad_oscura =
        fondos_oscuros >= min_fondos_requeridos && (max_lum_oscuro - min_lum_oscuro) <= 26.0;

    // 3. REGLA DE CONTRASTE CON PASILLOS INTER-CARTAS
    let huecos: Vec<&MuestraRoi> = muestras.iter().filter(|m| m.tipo == TipoMuestra::HuecoInterCarta).collect();
    let prom_fondo = if fondos_oscuros > 0 {
        (min_lum_oscuro + max_lum_oscuro) * 0.5
    } else {
        35.0
    };
    let mut diferencia_hueco_fondo = 0.0f32;
    if !huecos.is_empty() {
        let suma_huecos: f32 = huecos.iter().map(|h| h.color.luminancia()).sum();
        let prom_hueco = suma_huecos / huecos.len() as f32;
        diferencia_hueco_fondo = (prom_hueco - prom_fondo).abs();
    }

    // 4. REGLA DE REROLLS O BORDES METÁLICOS/PRISMÁTICOS BRILLANTES
    let rerolls: Vec<&MuestraRoi> = muestras.iter().filter(|m| m.tipo == TipoMuestra::BotonReroll).collect();
    let mut rerolls_dorados = 0;
    for r in rerolls {
        if r.color.r >= 120 && r.color.g >= 95 && r.color.r > r.color.b.saturating_add(10) {
            rerolls_dorados += 1;
        }
    }

    let bordes: Vec<&MuestraRoi> = muestras.iter().filter(|m| m.tipo == TipoMuestra::BordeRareza).collect();
    let mut bordes_con_contraste = 0;
    for b in bordes {
        let lum = b.color.luminancia();
        // El marco de la carta (plata, oro o prismático) debe contrastar claramente con el fondo oscuro interno
        if (lum - prom_fondo) >= 35.0 && (lum >= 85.0 || b.color.saturacion_cromatica() >= 25) {
            bordes_con_contraste += 1;
        }
    }

    // Confirmación estructural estricta:
    uniformidad_oscura
        && ((fondos_oscuros >= min_fondos_requeridos && (rerolls_dorados >= 1 || bordes_con_contraste >= 1))
            || (fondos_oscuros >= 3 && diferencia_hueco_fondo >= 10.0)
            || (rerolls_dorados >= 2 && fondos_oscuros >= 2))
}

/// Detecta las coordenadas porcentuales exactas (pos_x_pct, pos_y_pct) de la zona oscura inferior de cada una de las 3 cartas
pub fn detectar_coordenadas_exactas_cartas(
    img: &image::RgbaImage,
    caja16a9: Rectangulo,
) -> [(f32, f32); 3] {
    let mut posiciones = [
        (29.5f32, 58.8f32),
        (50.0f32, 58.8f32),
        (70.5f32, 58.8f32),
    ];

    if img.width() < 320 || img.height() < 200 || caja16a9.width == 0 || caja16a9.height == 0 {
        return posiciones;
    }

    let py_scan = (caja16a9.y as f32 + 0.56 * caja16a9.height as f32) as u32;
    if py_scan >= img.height() {
        return posiciones;
    }

    for (idx, &centro_nom) in CENTROS_X_CARTAS.iter().enumerate() {
        // Escaneo de borde izquierdo (entre centro - 0.105 y centro - 0.065)
        let x_izq_ini = (caja16a9.x as f32 + (centro_nom - 0.105) * caja16a9.width as f32) as u32;
        let x_izq_fin = (caja16a9.x as f32 + (centro_nom - 0.065) * caja16a9.width as f32) as u32;
        let mut mejor_x_izq = None;
        let mut max_lum_izq = 75.0f32;

        for px in x_izq_ini..=x_izq_fin.min(img.width().saturating_sub(1)) {
            let p = img.get_pixel(px, py_scan);
            let lum = ColorRgb::new(p[0], p[1], p[2]).luminancia();
            if lum > max_lum_izq {
                max_lum_izq = lum;
                mejor_x_izq = Some(px);
            }
        }

        // Escaneo de borde derecho (entre centro + 0.065 y centro + 0.105)
        let x_der_ini = (caja16a9.x as f32 + (centro_nom + 0.065) * caja16a9.width as f32) as u32;
        let x_der_fin = (caja16a9.x as f32 + (centro_nom + 0.105) * caja16a9.width as f32) as u32;
        let mut mejor_x_der = None;
        let mut max_lum_der = 75.0f32;

        for px in x_der_ini..=x_der_fin.min(img.width().saturating_sub(1)) {
            let p = img.get_pixel(px, py_scan);
            let lum = ColorRgb::new(p[0], p[1], p[2]).luminancia();
            if lum > max_lum_der {
                max_lum_der = lum;
                mejor_x_der = Some(px);
            }
        }

        let centro_x_caja = if let (Some(xi), Some(xd)) = (mejor_x_izq, mejor_x_der) {
            let cx_px = (xi + xd) as f32 * 0.5;
            let cx_rel = (cx_px - caja16a9.x as f32) / caja16a9.width as f32;
            cx_rel.clamp(centro_nom - 0.015, centro_nom + 0.015)
        } else {
            centro_nom
        };

        // Escaneo de borde inferior metálico/prismático de la carta (entre y = 0.610 y y = 0.655)
        let px_centro = (caja16a9.x as f32 + centro_x_caja * caja16a9.width as f32)
            .min(img.width().saturating_sub(1) as f32) as u32;
        let y_inf_ini = (caja16a9.y as f32 + 0.610 * caja16a9.height as f32) as u32;
        let y_inf_fin = (caja16a9.y as f32 + 0.655 * caja16a9.height as f32) as u32;
        let mut mejor_y_borde = None;
        let mut max_lum_inf = 80.0f32;

        for py in y_inf_ini..=y_inf_fin.min(img.height().saturating_sub(1)) {
            let p = img.get_pixel(px_centro, py);
            let lum = ColorRgb::new(p[0], p[1], p[2]).luminancia();
            if lum > max_lum_inf {
                max_lum_inf = lum;
                mejor_y_borde = Some(py);
            }
        }

        let pos_y_caja = if let Some(yb) = mejor_y_borde {
            let y_borde_rel = (yb as f32 - caja16a9.y as f32) / caja16a9.height as f32;
            // Posicionar la insignia en el hueco oscuro vacío debajo del texto y encima del borde inferior (borde - 4.5%)
            (y_borde_rel - 0.045).clamp(0.575, 0.600)
        } else {
            0.588
        };

        // Convertir coordenadas relativas de caja16a9 a porcentaje de la pantalla completa
        let abs_x = caja16a9.x as f32 + centro_x_caja * caja16a9.width as f32;
        let abs_y = caja16a9.y as f32 + pos_y_caja * caja16a9.height as f32;

        posiciones[idx] = (
            (abs_x / img.width() as f32) * 100.0,
            (abs_y / img.height() as f32) * 100.0,
        );
    }

    posiciones
}

/// Calcula el dHash de 64 bits para una región de interés (ROI)
pub fn calcular_dhash_64<I: GenericImageView<Pixel = Rgba<u8>>>(img: &I, roi: Rectangulo) -> u64 {
    // Escalar la región a 9x8 para comparar cada píxel con su vecino derecho (8 filas x 8 comparaciones = 64 bits)
    let mut lums = [[0u8; 9]; 8];
    for y in 0..8usize {
        for x in 0..9usize {
            let px = roi.x + (x as u32 * roi.width) / 9;
            let py = roi.y + (y as u32 * roi.height) / 8;
            if px < img.width() && py < img.height() {
                let pixel = img.get_pixel(px, py);
                let lum = (0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32) as u8;
                lums[y][x] = lum;
            }
        }
    }

    let mut hash = 0u64;
    for y in 0..8usize {
        for x in 0..8usize {
            hash <<= 1;
            if lums[y][x] > lums[y][x + 1] {
                hash |= 1;
            }
        }
    }
    hash
}

/// Distancia de Hamming entre dos hashes de 64 bits (número de bits distintos)
pub fn calcular_distancia_hamming(hash_a: u64, hash_b: u64) -> u32 {
    (hash_a ^ hash_b).count_ones()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalizacion_caja_16_a_9() {
        let c1080 = calcular_caja_16_a_9(1920, 1080);
        assert_eq!(c1080, Rectangulo { x: 0, y: 0, width: 1920, height: 1080 });

        let ultrawide = calcular_caja_16_a_9(2560, 1080);
        assert_eq!(ultrawide.width, 1920);
        assert_eq!(ultrawide.height, 1080);
        assert_eq!(ultrawide.x, 320);
    }

    #[test]
    fn test_filtro_anti_muerte_pantalla_gris() {
        // Pantalla gris de muerte en ARAM: saturación nula, bordes oscuros
        let muestras_muerte = vec![
            MuestraRoi { tipo: TipoMuestra::BotonReroll, color: ColorRgb::new(45, 45, 45) },
            MuestraRoi { tipo: TipoMuestra::BotonReroll, color: ColorRgb::new(48, 48, 48) },
            MuestraRoi { tipo: TipoMuestra::BotonReroll, color: ColorRgb::new(50, 50, 50) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(28, 28, 28) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(30, 30, 30) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(32, 32, 32) },
            MuestraRoi { tipo: TipoMuestra::Entorno, color: ColorRgb::new(20, 20, 20) },
        ];

        assert_eq!(evaluar_visibilidad_panel(&muestras_muerte), false);
    }

    #[test]
    fn test_simetria_3_cartas_visible() {
        // Panel real de aumentos en ARAM Caos con rerolls dorados y fondos oscuros
        let muestras_panel = vec![
            MuestraRoi { tipo: TipoMuestra::BotonReroll, color: ColorRgb::new(235, 195, 120) },
            MuestraRoi { tipo: TipoMuestra::BotonReroll, color: ColorRgb::new(240, 200, 125) },
            MuestraRoi { tipo: TipoMuestra::BotonReroll, color: ColorRgb::new(230, 190, 115) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(35, 38, 45) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(36, 40, 48) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(34, 37, 44) },
            MuestraRoi { tipo: TipoMuestra::HuecoInterCarta, color: ColorRgb::new(15, 18, 22) },
            MuestraRoi { tipo: TipoMuestra::Entorno, color: ColorRgb::new(18, 20, 25) },
        ];

        assert_eq!(evaluar_visibilidad_panel(&muestras_panel), true);
    }

    #[test]
    fn test_panel_visible_sin_rerolls_o_dados_inactivos() {
        // Panel de aumentos cuando el jugador gastó sus dados (0 rerolls o grisáceos)
        let muestras_sin_dados = vec![
            MuestraRoi { tipo: TipoMuestra::BotonReroll, color: ColorRgb::new(60, 60, 65) },
            MuestraRoi { tipo: TipoMuestra::BotonReroll, color: ColorRgb::new(58, 58, 62) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(32, 35, 42) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(30, 34, 40) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(33, 36, 41) },
            MuestraRoi { tipo: TipoMuestra::BordeRareza, color: ColorRgb::new(180, 150, 80) },
            MuestraRoi { tipo: TipoMuestra::HuecoInterCarta, color: ColorRgb::new(14, 16, 20) },
            MuestraRoi { tipo: TipoMuestra::Entorno, color: ColorRgb::new(16, 18, 22) },
        ];

        assert_eq!(evaluar_visibilidad_panel(&muestras_sin_dados), true);
    }

    #[test]
    fn test_panel_visible_con_nieve_aram() {
        // En Howling Abyss la nieve en entorno es brillante (luminancia > 150)
        let muestras_aram_nieve = vec![
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(30, 32, 40) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(28, 30, 38) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(32, 35, 42) },
            MuestraRoi { tipo: TipoMuestra::BordeRareza, color: ColorRgb::new(190, 160, 90) },
            MuestraRoi { tipo: TipoMuestra::Entorno, color: ColorRgb::new(170, 185, 210) }, // nieve brillante
        ];

        assert_eq!(evaluar_visibilidad_panel(&muestras_aram_nieve), true);
    }

    #[test]
    fn test_distancia_hamming_dhash() {
        assert_eq!(calcular_distancia_hamming(0b1100, 0b1100), 0);
        assert_eq!(calcular_distancia_hamming(0b1100, 0b1111), 2);
    }

    #[test]
    fn test_rechazo_terreno_oscuro_sin_cartas() {
        // Sombra oscura del mapa de LoL sin bordes metálicos ni contraste de pasillo inter-cartas
        let muestras_terreno = vec![
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(28, 42, 26) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(30, 44, 28) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(29, 43, 27) },
            MuestraRoi { tipo: TipoMuestra::HuecoInterCarta, color: ColorRgb::new(29, 43, 27) },
            MuestraRoi { tipo: TipoMuestra::HuecoInterCarta, color: ColorRgb::new(30, 44, 28) },
            MuestraRoi { tipo: TipoMuestra::BordeRareza, color: ColorRgb::new(28, 40, 26) },
            MuestraRoi { tipo: TipoMuestra::BotonReroll, color: ColorRgb::new(25, 38, 24) },
        ];
        assert_eq!(evaluar_visibilidad_panel(&muestras_terreno), false);
    }

    #[test]
    fn test_detectar_coordenadas_exactas_cartas_nominales() {
        let img = image::RgbaImage::from_pixel(1920, 1080, Rgba([25, 30, 38, 255]));
        let caja = calcular_caja_16_a_9(1920, 1080);
        let coords = detectar_coordenadas_exactas_cartas(&img, caja);
        assert!((coords[0].0 - 29.5).abs() < 0.1);
        assert!((coords[1].0 - 50.0).abs() < 0.1);
        assert!((coords[2].0 - 70.5).abs() < 0.1);
        assert!((coords[0].1 - 58.8).abs() < 0.1);
    }

    #[test]
    fn test_rechazo_puente_hielo_aram_azul() {
        // Suelo azulado de Howling Abyss sin cartas en pantalla (canal azul > 90)
        let muestras_hielo = vec![
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(15, 55, 110) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(20, 60, 115) },
            MuestraRoi { tipo: TipoMuestra::FondoCarta, color: ColorRgb::new(18, 58, 112) },
            MuestraRoi { tipo: TipoMuestra::HuecoInterCarta, color: ColorRgb::new(35, 90, 160) },
            MuestraRoi { tipo: TipoMuestra::BordeRareza, color: ColorRgb::new(40, 100, 175) },
        ];
        assert_eq!(evaluar_visibilidad_panel(&muestras_hielo), false);
    }
}
