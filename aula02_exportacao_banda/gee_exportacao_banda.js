// =============================================================================
// AULA 02 — Exportação de Banda Sentinel-2 para o Google Drive
// =============================================================================
// Plataforma : Google Earth Engine (GEE) — JavaScript
// Área de estudo : Bacia do Pirajibu-Mirim, Sorocaba/SP, Brasil
// Como usar :
//   1. Acesse https://code.earthengine.google.com/
//   2. Cole o conteúdo deste arquivo no editor de código
//   3. Ajuste as variáveis na seção "CONFIGURAÇÕES" conforme necessário
//   4. Clique em "Run"
// Dependências : Sentinel-2 SR (COPERNICUS/S2_SR_HARMONIZED),
//                variável `sorocaba` (geometria da AOI definida no GEE)
// =============================================================================

var aoi = sorocaba;

Map.addLayer(aoi, {color: 'red'}, 'Limite Sorocaba');
Map.centerObject(aoi, 10);

//Selecionar o banco de dados do Sentinel
var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(aoi)
    .filterDate('2026-07-01','2026-07-31')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .median()
    .clip(aoi);

//Exportar para Google Drive
Export.image.toDrive({
  image: s2.select('B2'),
  description: 'Sentinel2_B2',
  folder: 'GEE',
  fileNamePrefix: 'Sentinel2_B2',
  region: aoi,
  scale: 10,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});
