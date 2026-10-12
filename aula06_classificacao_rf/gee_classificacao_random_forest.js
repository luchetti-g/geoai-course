// =============================================================================
// AULA 06 — Classificação de Uso e Cobertura do Solo com Random Forest
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
//                variáveis `bacia` e `sorocaba` (geometrias definidas no GEE)
// Classes      : Floresta, Veg. Herbácea, Silvicultura,
//                Agropecuária, Não Vegetado, Água
// =============================================================================

//AULA 6 – MACHINE LEARNING APLICADO AO USO E COBERTURA DA TERRA
//Classificação da Bacia Pirajibu-Mirim com Random Forest

//Definindo limite
var aoi = pirajibuMirim;
Map.addLayer(aoi, {color: 'red'}, 'Limite Bacia Pirajibu-Mirim');
Map.centerObject(aoi, 10);

// Geometria da bacia simplificada (tolerância de 10 m): reduz muito o uso de memória
var bacia = ee.FeatureCollection(aoi).geometry(10).simplify(10);

//Definindo período (estação seca de 2025: menos nuvens)
var start = '2025-04-01'
var end = '2025-10-01'   // a data final não entra no filtro; assim o dia 30/09 é incluído

//Selecionando o banco de dados do Sentinel 2 - L2A (resolução 10 m)
var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(bacia)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
    .select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .sort('system:time_start');

// Quantidade de imagens Sentinel-2
print('Quantidade de imagens Sentinel-2:', s2.size());

//Calculando os índices
function calcNDVI(img) {
  return img.normalizedDifference(['B8', 'B4']).rename('NDVI')
    .set('system:time_start', img.get('system:time_start'));
}

function calcNDWI(img) {
  return img.normalizedDifference(['B3', 'B8']).rename('NDWI')
    .set('system:time_start', img.get('system:time_start'));
}

function calcNDBI(img) {
  return img.normalizedDifference(['B11', 'B8']).rename('NDBI')
    .set('system:time_start', img.get('system:time_start'));
}

//Paletas de cada índice
var visNDVI = {min: -0.2, max: 0.9, palette: ['#d73027', '#fee08b', '#a6d96a', '#1a9850', '#00441b']};
var visNDWI = {min: -0.6, max: 0.4, palette: ['#8c510a', '#f6e8c3', '#80cdc1', '#2166ac']};
var visNDBI = {min: -0.5, max: 0.3, palette: ['#1a9850', '#ffffbf', '#fc8d59', '#b2182b']};


//ETAPA 1 – IMAGEM DE ENTRADA
//    a) adiciona os índices em cada imagem
//    b) faz a mediana do período -> 1 imagem sem nuvens
//    c) seleciona os 9 atributos que o Random Forest vai usar

function adicionarIndices(img) {
  return img.divide(10000)                       // reflectância de 0 a 1
    .addBands([calcNDVI(img), calcNDWI(img), calcNDBI(img)])
    .copyProperties(img, ['system:time_start']);
}

var bandas = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'NDVI', 'NDWI', 'NDBI'];

var imagem = ee.Image(s2.map(adicionarIndices).median())
  .select(bandas)
  .clip(bacia);

Map.addLayer(imagem, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.15}, 'Sentinel-2 cor natural');
Map.addLayer(imagem, {bands: ['B8', 'B4', 'B3'], min: 0, max: 0.35}, 'Sentinel-2 falsa cor', false);
Map.addLayer(imagem.select('NDVI'), visNDVI, 'NDVI', false);
Map.addLayer(imagem.select('NDWI'), visNDWI, 'NDWI', false);
Map.addLayer(imagem.select('NDBI'), visNDBI, 'NDBI', false);


//Definindo as classes
var nomesClasses = ['Floresta', 'Vegetação herbácea', 'Silvicultura',
                    'Agropecuária', 'Área não vegetada', 'Água'];
var coresClasses = ['#1f8d49', '#d6bc74', '#7a5900', '#ffefc3', '#d4271e', '#2532e4'];
var visClasses = {min: 1, max: 6, palette: coresClasses};

//ETAPA 2 – AMOSTRAS: ÁREAS ESTÁVEIS DO MAPBIOMAS (COLEÇÃO 11)
//    a) agrupa as classes do MapBiomas de 2021 a 2025
//    b) mantém só os pixels que tiveram a mesma classe nos 5 anos
//    c) sorteia pontos em cada classe

//Códigos do MapBiomas agrupados nas 6 classes definidas
var de   = [3, 4, 49,   11, 12, 29,   9,   15, 18, 19, 20, 21, 36, 39, 40, 41, 46, 47, 48,   23, 24, 25, 30, 75,   31, 33];
var para = [1, 1, 1,    2, 2, 2,      3,   4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,               5, 5, 5, 5, 5,        6, 6];

var mapbiomas = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3');
print('Bandas do MapBiomas:', mapbiomas.bandNames());

var anos = ['2021', '2022', '2023', '2024', '2025'];

var serieMapbiomas = ee.Image.cat(anos.map(function (ano) {
  return mapbiomas.select('classification_' + ano).remap(de, para);
}));

var estavel = serieMapbiomas.reduce(ee.Reducer.count()).eq(anos.length)
  .and(serieMapbiomas.reduce(ee.Reducer.countDistinct()).eq(1));

var rotulo = serieMapbiomas.select(anos.length - 1)
  .updateMask(estavel)
  .rename('classe')
  .clip(bacia);

Map.addLayer(rotulo, visClasses, 'Referência MapBiomas estável 2021–2025', false);

//*************************************************//
var amostras = imagem.addBands(rotulo).stratifiedSample({
  numPoints: 300,          // até 300 pontos por classe
  classBand: 'classe',
  region: bacia,
  scale: 30,               // escala do MapBiomas
  seed: 42,
  geometries: true,
  tileScale: 8             // divide o cálculo em partes menores (menos memória)
});

print('Amostras por classe:', amostras.aggregate_histogram('classe'));
Map.addLayer(amostras, {color: 'magenta'}, 'Pontos amostrais', false);


//ETAPA 3 – TREINO (70%) E TESTE (30%)
amostras = amostras.randomColumn('aleatorio', 42);

var treino = amostras.filter(ee.Filter.lt('aleatorio', 0.7));
var teste  = amostras.filter(ee.Filter.gte('aleatorio', 0.7));

print('Amostras de treino:', treino.size());
print('Amostras de teste:', teste.size());


//ETAPA 4 – TREINANDO O RANDOM FOREST
var rf = ee.Classifier.smileRandomForest({
  numberOfTrees: 100,       // número de árvores que votam
  minLeafPopulation: 1,     // mínimo de amostras por folha
  bagFraction: 0.5,         // cada árvore vê 50% das amostras
  seed: 42
}).train({
  features: treino,
  classProperty: 'classe',
  inputProperties: bandas
});


//ETAPA 5 – CLASSIFICANDO A BACIA
var classificada = imagem.classify(rf).clip(bacia);
Map.addLayer(classificada, visClasses, 'Random Forest 2025');


//ETAPA 6 – ACURÁCIA E IMPORTÂNCIA DAS VARIÁVEIS
var matriz = teste.classify(rf).errorMatrix('classe', 'classification', [1, 2, 3, 4, 5, 6]);

print('Matriz de confusão (linhas = referência, colunas = classificado):', matriz);
print('Acurácia global:', matriz.accuracy());
print('Kappa:', matriz.kappa());
print('Acurácia do produtor:', matriz.producersAccuracy());
print('Acurácia do usuário:', matriz.consumersAccuracy());

var importancia = ee.Dictionary(rf.explain().get('importance'));
print('Importância das variáveis:', importancia);

print(ui.Chart.feature.byProperty(ee.FeatureCollection([ee.Feature(null, importancia)]))
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Random Forest – importância das variáveis',
    legend: {position: 'none'},
    hAxis: {title: 'Atributo'},
    vAxis: {title: 'Importância'},
    colors: ['#1a9850']
  }));


//ETAPA 7 – ÁREA DE CADA CLASSE NA BACIA (hectares)
var gruposArea = ee.List(ee.Image.pixelArea().divide(10000)
  .addBands(classificada)
  .reduceRegion({
    reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'classe'}),
    geometry: bacia,
    scale: 10,
    maxPixels: 1e13,
    tileScale: 8
  }).get('groups'));

var tabelaArea = ee.FeatureCollection(gruposArea.map(function (g) {
  g = ee.Dictionary(g);
  var codigo = ee.Number(g.get('classe')).int();
  return ee.Feature(null, {
    codigo: codigo,
    classe: ee.List(nomesClasses).get(codigo.subtract(1)),
    area_ha: g.get('sum')
  });
}));

print('Área por classe (ha):', tabelaArea);

print(ui.Chart.feature.byFeature(tabelaArea, 'classe', 'area_ha')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Área por classe – Bacia Pirajibu-Mirim (RF 2025)',
    legend: {position: 'none'},
    vAxis: {title: 'Área (ha)'},
    colors: ['#7a5900']
  }));


//ETAPA 8 – (OPCIONAL) COMPARANDO COM SVM
//Para rodar, troque false por true
var compararSVM = false;

if (compararSVM) {
  var svm = ee.Classifier.libsvm({kernelType: 'RBF', gamma: 0.5, cost: 10})
    .train({features: treino, classProperty: 'classe', inputProperties: bandas});

  Map.addLayer(imagem.classify(svm).clip(bacia), visClasses, 'SVM 2025', false);

  var matrizSVM = teste.classify(svm).errorMatrix('classe', 'classification', [1, 2, 3, 4, 5, 6]);
  print('SVM – Matriz de confusão:', matrizSVM);
  print('SVM – Acurácia global:', matrizSVM.accuracy());
  print('SVM – Kappa:', matrizSVM.kappa());
}


//ETAPA 9 – EXPORTAÇÕES PARA O GOOGLE DRIVE

// exportação 1: mapa classificado (GeoTIFF)
Export.image.toDrive({
  image: classificada.toByte(),
  description: 'RF_LULC_2025_Pirajibu',
  folder: 'GEE_Pirajibu_Mirim',
  region: bacia,
  scale: 10,
  crs: 'EPSG:31983',   // SIRGAS 2000 / UTM 23S (região de Sorocaba)
  maxPixels: 1e13
});

// exportação 2: pontos amostrais (Shapefile) para revisar no QGIS
Export.table.toDrive({
  collection: amostras,
  description: 'Amostras_RF_LULC_2025_Pirajibu',
  folder: 'GEE_Pirajibu_Mirim',
  fileFormat: 'SHP'
});

// exportação 3: área por classe (CSV)
Export.table.toDrive({
  collection: tabelaArea,
  description: 'Area_classes_RF_LULC_2025_Pirajibu',
  folder: 'GEE_Pirajibu_Mirim',
  fileFormat: 'CSV',
  selectors: ['codigo', 'classe', 'area_ha']
});

// exportação 4: acurácia (CSV)
Export.table.toDrive({
  collection: ee.FeatureCollection([ee.Feature(null, {
    acuracia_global: matriz.accuracy(),
    kappa: matriz.kappa(),
    amostras_treino: treino.size(),
    amostras_teste: teste.size()
  })]),
  description: 'Acuracia_RF_LULC_2025_Pirajibu',
  folder: 'GEE_Pirajibu_Mirim',
  fileFormat: 'CSV'
});


//LEGENDA NO MAPA
var legenda = ui.Panel({style: {position: 'bottom-left', padding: '8px 12px'}});
legenda.add(ui.Label('Uso e cobertura – RF 2025', {fontWeight: 'bold', fontSize: '14px'}));

nomesClasses.forEach(function (nomeClasse, i) {
  legenda.add(ui.Panel([
    ui.Label('', {backgroundColor: coresClasses[i], padding: '8px', margin: '0 6px 4px 0'}),
    ui.Label(nomeClasse, {margin: '0 0 4px 0'})
  ], ui.Panel.Layout.Flow('horizontal')));
});

Map.add(legenda);
