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
    // Si más del 80% está desaturado o la saturación máxima de la pantalla es casi nula (< 14), es pantalla de muerte
    if proporcion_desaturadas > 0.80 || max_sat < 14 {
        return false;
    }

    // 2. REGLA DE ENTORNO: Rechazo de Tienda o Tabulador (pantalla muy iluminada)
    let entornos: Vec<&MuestraRoi> = muestras.iter().filter(|m| m.tipo == TipoMuestra::Entorno).collect();
    if !entornos.is_empty() {
        let lum_media: f32 = entornos.iter().map(|m| m.color.luminancia()).sum::<f32>() / entornos.len() as f32;
        if lum_media > 85.0 {
            return false;
        }
    }

    // 3. REGLA DE FONDOS OSCUROS DE LAS CARTAS (luminancia < 55)
    let fondos: Vec<&MuestraRoi> = muestras.iter().filter(|m| m.tipo == TipoMuestra::FondoCarta).collect();
    let fondos_oscuros = fondos.iter().filter(|m| m.color.luminancia() <= 55.0).count();

    // 4. REGLA DE REROLLS O BORDES DE COLOR
    let rerolls: Vec<&MuestraRoi> = muestras.iter().filter(|m| m.tipo == TipoMuestra::BotonReroll).collect();
    let mut rerolls_dorados = 0;
    for r in rerolls {
        // Tono dorado/ámbar del dado: R alto, G medio-alto, R > B + 15
        if r.color.r >= 135 && r.color.g >= 110 && r.color.r > r.color.b.saturating_add(15) {
            rerolls_dorados += 1;
        }
    }

    let bordes: Vec<&MuestraRoi> = muestras.iter().filter(|m| m.tipo == TipoMuestra::BordeRareza).collect();
    let mut bordes_con_color = 0;
    for b in bordes {
        if b.color.saturacion_cromatica() >= 18 || b.color.luminancia() > 65.0 {
            bordes_con_color += 1;
        }
    }

    // 5. REGLA DE PASILLOS INTER-CARTAS
    let huecos: Vec<&MuestraRoi> = muestras.iter().filter(|m| m.tipo == TipoMuestra::HuecoInterCarta).collect();
    if !huecos.is_empty() && fondos.len() >= 2 {
        let lum_fondos = fondos.iter().map(|m| m.color.luminancia()).sum::<f32>() / fondos.len() as f32;
        let lum_huecos = huecos.iter().map(|m| m.color.luminancia()).sum::<f32>() / huecos.len() as f32;
        // Si no hay diferencia estructural entre los pasillos y las cartas (color plano)
        if (lum_fondos - lum_huecos).abs() < 1.5 && rerolls_dorados == 0 {
            return false;
        }
    }

    // Confirmación positiva robusta:
    // 1) Al menos 2 fondos oscuros + presencia de rerolls o bordes ornamentales
    // 2) O al menos 3 fondos oscuros de cartas con huecos estructurales (sin reroll disponible)
    // 3) O al menos 2 dados de reroll activos
    (fondos_oscuros >= 2 && (rerolls_dorados >= 1 || bordes_con_color >= 1))
        || (fondos_oscuros >= 3 && !huecos.is_empty())
        || (fondos_oscuros >= 3)
        || (rerolls_dorados >= 2)
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
    fn test_distancia_hamming_dhash() {
        assert_eq!(calcular_distancia_hamming(0b1100, 0b1100), 0);
        assert_eq!(calcular_distancia_hamming(0b1100, 0b1111), 2);
    }
}
