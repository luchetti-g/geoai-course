// =============================================================================
// AULA 03 — Série Temporal Mensal de Índices (NDVI, NDWI, NDBI)
// =============================================================================
// Plataforma : Google Earth Engine (GEE) — JavaScript
// Área de estudo : Bacia do Pirajibu-Mirim, Sorocaba/SP, Brasil
// Como usar :
//   1. Acesse https://code.earthengine.google.com/
//   2. Cole o conteúdo deste arquivo no editor de código
//   3. Ajuste as variáveis na seção "CONFIGURAÇÕES" conforme necessário
//   4. Clique em "Run"
// Dependências : Sentinel-2 SR (COPERNICUS/S2_SR_HARMONIZED),
//                MapBiomas Col.9 (pixels estáveis 2021-2025),
//                variável `bacia` (geometria da AOI definida no GEE)
// =============================================================================

//Defininfo limite
var aoi = pirajibuMirim;
Map.addLayer(aoi, {color: 'red'}, 'Limite Bacia Pirajibu-Mirim');
Map.centerObject(aoi, 10);

// Geometria da bacia simplificada (tolerância de 10 m): reduz muito o uso de memória
var bacia = ee.FeatureCollection(aoi).geometry(10).simplify(10);

//Definindo período
var start = '2023-01-01'
var end = '2025-12-31'   // a data final não entra no filtro; assim o dia 30/09 é incluído

//Selecionando o banco de dados do Sentinel 2 - L2A (resolução 10 m)
var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(bacia)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
    .select(['B3', 'B4', 'B8', 'B11'])   // B11 (SWIR) é necessária para o NDBI
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

//FUNÇÃO QUE FAZ A ANÁLISE MENSAL DE UM ÍNDICE
//    a) calcula o índice em todas as imagens
//    b) faz a média das imagens de cada mês -> 1 imagem por mês
//    c) calcula a média de todos os pixels da bacia em cada mês
//    d) gera o gráfico e as estatísticas
//    e) exporta a tabela (CSV) e as imagens mensais (GeoTIFF)

// Lista dos meses que têm imagem (ex.: '2019-07'), calculada uma única vez
var meses = s2.aggregate_array('system:time_start')
  .map(function (t) { return ee.Date(t).format('YYYY-MM'); })
  .distinct();
print('Nº de meses com imagem:', meses.size());

function analisarIndice(nome, funcaoIndice, vis) {

//para cada mês: filtra as imagens do mês, calcula o índice em cada uma e faz a média -> 1 imagem por mês
  var mensal = ee.ImageCollection.fromImages(meses.map(function (m) {
    var inicioMes = ee.Date.parse('YYYY-MM', m);
    return s2.filterDate(inicioMes, inicioMes.advance(1, 'month'))
      .map(funcaoIndice)
      .mean()
      .set('mes', m)
      .set('banda', ee.String(m).replace('-', '_'))
      .set('system:time_start', inicioMes.millis());
  }));

// c) valor médio da bacia em cada mês
  var serie = ee.FeatureCollection(mensal.map(function (img) {
    var media = img.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: bacia,
      scale: 10,
      maxPixels: 1e13,
      tileScale: 8          // divide o cálculo em partes menores (menos memória)
    });
    return ee.Feature(null, media)
      .set('system:time_start', img.get('system:time_start'))
      .set('mes', img.get('mes'));
  })).filter(ee.Filter.notNull([nome]));   // remove meses em que a bacia ficou sem valor

// d) gráfico
  print(ui.Chart.feature.byFeature(serie, 'system:time_start', [nome])
    .setOptions({
      title: nome + ' médio mensal – Bacia Pirajibu-Mirim',
      hAxis: {title: 'Mês', format: 'MM/yyyy'},
      vAxis: {title: nome},
      colors: [vis.palette[vis.palette.length - 1]],
      lineWidth: 2,
      pointSize: 3
    }));

// d) estatísticas
  print(nome + ' – Média', serie.aggregate_mean(nome));
  print(nome + ' – Desvio padrão', serie.aggregate_sample_sd(nome));
  print(nome + ' – Máximo', serie.aggregate_max(nome));
  print(nome + ' – Mês do máximo', serie.sort(nome, false).first().get('mes'));
  print(nome + ' – Mínimo', serie.aggregate_min(nome));
  print(nome + ' – Mês do mínimo', serie.sort(nome).first().get('mes'));

  // e) exportação 1: tabela CSV com o valor médio da bacia em cada mês
  Export.table.toDrive({
    collection: serie,
    description: nome + '_serie_mensal_Pirajibu',
    folder: 'GEE_Pirajibu_Mirim',
    fileFormat: 'CSV',
    selectors: ['mes', nome]
  });

  // e) exportação 2: GeoTIFF com uma banda por mês (ex.: NDVI_2018_01, NDVI_2018_02...)
  var nomesBandas = mensal.aggregate_array('banda')
    .map(function (b) { return ee.String(nome + '_').cat(b); });

  Export.image.toDrive({
    image: mensal.toBands().rename(nomesBandas).clip(bacia).toFloat(),
    description: nome + '_imagens_mensais_Pirajibu',
    folder: 'GEE_Pirajibu_Mirim',
    region: bacia,
    scale: 10,
    crs: 'EPSG:31983',   // SIRGAS 2000 / UTM 23S (região de Sorocaba)
    maxPixels: 1e13
  });


// mapa: último mês da série
  var ultimoMes = mensal.sort('system:time_start', false).first();
  print(nome + ' – mês do último mapa', ultimoMes.get('mes'));
  Map.addLayer(ultimoMes.clip(bacia), vis, nome + ' – último mês');

  return mensal;   // coleção com uma imagem por mês
}

//Roda e gera tudo para os três índices
analisarIndice('NDVI', calcNDVI, visNDVI);
analisarIndice('NDWI', calcNDWI, visNDWI);
analisarIndice('NDBI', calcNDBI, visNDBI);
