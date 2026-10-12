// =============================================================================
// AULA 08 (Parte 1/2) — Preparação do Stack de Dados para a U-Net
// =============================================================================
// Plataforma : Google Earth Engine (GEE) — JavaScript
// Área de estudo : Bacia do Pirajibu-Mirim, Sorocaba/SP, Brasil
// Como usar :
//   1. Acesse https://code.earthengine.google.com/
//   2. Cole o conteúdo deste arquivo no editor de código
//   3. Ajuste as variáveis na seção "CONFIGURAÇÕES" conforme necessário
//   4. Clique em "Run"
// Dependências : Sentinel-2 SR (COPERNICUS/S2_SR_HARMONIZED),
//                MapBiomas Col.9 (projects/mapbiomas-workspace/...),
//                variável `bacia` (geometria da AOI definida no GEE)
// Saída        : GeoTIFF de 11 bandas (9 features + labels + máscara)
//                exportado para o Google Drive
// =============================================================================

//AULA – U-NET APLICADA AO USO E COBERTURA DA TERRA
//Preparação dos dados no GEE para treinar a U-Net no Google Colab
//Bacia Pirajibu-Mirim – Sentinel-2 (2025) + MapBiomas Coleção 11

//O que este script faz:
//  1) monta a MESMA imagem usada no Random Forest (9 atributos, mediana da seca de 2025);
//  2) monta o rótulo de treino: MapBiomas estável 2021–2025 (mesma regra do RF);
//  3) exporta imagem + rótulo + máscara da bacia num ÚNICO GeoTIFF (mesma grade, 10 m);


//Definindo limite
var aoi = pirajibuMirim;
var bacia = ee.FeatureCollection(aoi).geometry(10).simplify(10);

// A U-Net trabalha com recortes quadrados (tiles). Por isso exportamos um RETÂNGULO
// com 3 km de folga ao redor da bacia: mais área para treinar e sem bordas vazias.
// O mapa final será recortado de volta para a bacia.
var regiao = bacia.buffer(3000, 10).bounds(10);

Map.centerObject(bacia, 11);
Map.addLayer(ee.Image().paint(ee.FeatureCollection([ee.Feature(regiao)]), 0, 2), {palette: ['black']}, 'Região exportada (bacia + 3 km)');
Map.addLayer(ee.Image().paint(ee.FeatureCollection([ee.Feature(bacia)]), 0, 2), {palette: ['red']}, 'Limite Bacia Pirajibu-Mirim');

print('Área da bacia (km²):', bacia.area(10).divide(1e6));
print('Área exportada (km²):', regiao.area(10).divide(1e6));


//ETAPA 1 – IMAGEM DE ENTRADA (mesmos 9 atributos da aula de Random Forest)
var start = '2025-04-01';
var end = '2025-10-01';

var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(regiao)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
    .select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']);

print('Quantidade de imagens Sentinel-2:', s2.size());

function adicionarIndices(img) {
  var ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');
  var ndwi = img.normalizedDifference(['B3', 'B8']).rename('NDWI');
  var ndbi = img.normalizedDifference(['B11', 'B8']).rename('NDBI');
  return img.divide(10000).addBands([ndvi, ndwi, ndbi])
    .copyProperties(img, ['system:time_start']);
}

var bandas = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'NDVI', 'NDWI', 'NDBI'];

var imagem = ee.Image(s2.map(adicionarIndices).median()).select(bandas).clip(regiao);

Map.addLayer(imagem, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.15}, 'Sentinel-2 cor natural');
Map.addLayer(imagem, {bands: ['B8', 'B4', 'B3'], min: 0, max: 0.35}, 'Sentinel-2 falsa cor', false);


//ETAPA 2 – RÓTULO DE TREINO: MAPBIOMAS ESTÁVEL 2021–2025 (mesma regra do RF)
var nomesClasses = ['Floresta', 'Vegetação herbácea', 'Silvicultura',
                    'Agropecuária', 'Área não vegetada', 'Água'];
var coresClasses = ['#1f8d49', '#d6bc74', '#7a5900', '#ffefc3', '#d4271e', '#2532e4'];
var visClasses = {min: 1, max: 6, palette: coresClasses};

var de   = [3, 4, 49,   11, 12, 29,   9,   15, 18, 19, 20, 21, 36, 39, 40, 41, 46, 47, 48,   23, 24, 25, 30, 75,   31, 33];
var para = [1, 1, 1,    2, 2, 2,      3,   4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,               5, 5, 5, 5, 5,        6, 6];

var mapbiomas = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3');
var anos = ['2021', '2022', '2023', '2024', '2025'];

var serieMapbiomas = ee.Image.cat(anos.map(function (ano) {
  return mapbiomas.select('classification_' + ano).remap(de, para);
}));

var estavel = serieMapbiomas.reduce(ee.Reducer.count()).eq(anos.length)
  .and(serieMapbiomas.reduce(ee.Reducer.countDistinct()).eq(1));

// Diferença em relação ao RF: a U-Net precisa de uma MÁSCARA COMPLETA, não de pontos.
// Pixels instáveis (que mudaram de classe entre 2021 e 2025) recebem 0 = "sem rótulo".
// No Colab, esses pixels são IGNORADOS no cálculo do erro: a rede vê a imagem ali,
// mas não é cobrada por eles.
var rotulo = serieMapbiomas.select(anos.length - 1)
  .updateMask(estavel)
  .unmask(0)
  .rename('classe')
  .clip(regiao);

Map.addLayer(rotulo.selfMask(), visClasses, 'Rótulo de treino (MapBiomas estável)', false);


//ETAPA 3 – PILHA PARA A U-NET (um único GeoTIFF, mesma grade)
//   bandas 1–9 : atributos (B2, B3, B4, B8, B11, B12, NDVI, NDWI, NDBI)
//   banda 10   : classe (0 = sem rótulo; 1–6 = classes)
//   banda 11   : bacia (1 = dentro da bacia; 0 = fora)
var mascaraBacia = ee.Image(1).clip(bacia).unmask(0).rename('bacia');

var pilha = imagem.unmask(0)
  .addBands(rotulo)
  .addBands(mascaraBacia)
  .toFloat()
  .clip(regiao);

print('Bandas da pilha:', pilha.bandNames());

Export.image.toDrive({
  image: pilha,
  description: 'UNet_pilha_S2_MapBiomas_2025',
  folder: 'GEE_Pirajibu_Mirim',
  region: regiao,
  scale: 10,
  crs: 'EPSG:31983',      // SIRGAS 2000 / UTM 23S
  maxPixels: 1e13
});


//LEGENDA
var legenda = ui.Panel({style: {position: 'bottom-left', padding: '8px 12px'}});
legenda.add(ui.Label('Classes (rótulo de treino)', {fontWeight: 'bold', fontSize: '14px'}));
nomesClasses.forEach(function (nomeClasse, i) {
  legenda.add(ui.Panel([
    ui.Label('', {backgroundColor: coresClasses[i], padding: '8px', margin: '0 6px 4px 0'}),
    ui.Label((i + 1) + ' – ' + nomeClasse, {margin: '0 0 4px 0'})
  ], ui.Panel.Layout.Flow('horizontal')));
});
Map.add(legenda);
