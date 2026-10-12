// =============================================================================
// AULA 07 — Validação da Classificação por Blocos Espaciais
// =============================================================================
// Plataforma : Google Earth Engine (GEE) — JavaScript
// Área de estudo : Bacia do Pirajibu-Mirim, Sorocaba/SP, Brasil
// Como usar :
//   1. Acesse https://code.earthengine.google.com/
//   2. Cole o conteúdo deste arquivo no editor de código
//   3. Ajuste as variáveis na seção "CONFIGURAÇÕES" conforme necessário
//   4. Clique em "Run"
// Dependências : Sentinel-2 SR (COPERNICUS/S2_SR_HARMONIZED),
//                resultado da Aula 06 (classificação RF exportada),
//                amostras de validação
// =============================================================================

// =====================================================================
// VALIDAÇÃO DA CLASSIFICAÇÃO – Bacia Pirajibu-Mirim (Sentinel-2 2025 + RF)
// =====================================================================

// ---------- 1. ÁREA, IMAGEM E CLASSES --------------------------------
var bacia = ee.FeatureCollection(pirajibuMirim).geometry(10).simplify(10);
Map.centerObject(bacia, 11);

var bandas = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'NDVI', 'NDWI', 'NDBI'];

var imagem = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(bacia)
  .filterDate('2025-04-01', '2025-10-01')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
  .map(function (img) {
    return img.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']).divide(10000).addBands([
      img.normalizedDifference(['B8', 'B4']).rename('NDVI'),
      img.normalizedDifference(['B3', 'B8']).rename('NDWI'),
      img.normalizedDifference(['B11', 'B8']).rename('NDBI')
    ]);
  })
  .median().select(bandas).clip(bacia);

var classes = [1, 2, 3, 4, 5, 6];
var nomes   = ['Floresta', 'Veg. herbácea', 'Silvicultura', 'Agropecuária', 'Não vegetada', 'Água'];
var colunas = ['Floresta', 'Herbacea', 'Silvicultura', 'Agropecuaria', 'NaoVegetada', 'Agua']; // nomes p/ CSV
var vis = {min: 1, max: 6, palette: ['#1f8d49', '#d6bc74', '#7a5900', '#ffefc3', '#d4271e', '#2532e4']};
var pasta = 'GEE_Pirajibu_Mirim';


// ---------- 2. AMOSTRAS: ÁREAS ESTÁVEIS DO MAPBIOMAS 2021–2025 --------
var de   = [3, 4, 49, 11, 12, 29, 9, 15, 18, 19, 20, 21, 36, 39, 40, 41, 46, 47, 48, 23, 24, 25, 30, 75, 31, 33];
var para = [1, 1, 1,  2,  2,  2,  3, 4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  5,  5,  5,  5,  5,  6,  6];
var anos = ['2021', '2022', '2023', '2024', '2025'];

var mb = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3');
var serie = ee.Image.cat(anos.map(function (a) {
  return mb.select('classification_' + a).remap(de, para);
}));
var estavel = serie.reduce(ee.Reducer.count()).eq(anos.length)
  .and(serie.reduce(ee.Reducer.countDistinct()).eq(1));
var rotulo = serie.select(anos.length - 1).updateMask(estavel).rename('classe');

var amostras = imagem.addBands(rotulo).stratifiedSample({
  numPoints: 300, classBand: 'classe', region: bacia,
  scale: 30, seed: 42, geometries: true, tileScale: 8
}).randomColumn('aleatorio', 42);

var treino = amostras.filter(ee.Filter.lt('aleatorio', 0.7));   // 70%
var teste  = amostras.filter(ee.Filter.gte('aleatorio', 0.7));  // 30%


// ---------- 3. RANDOM FOREST E MAPA ----------------------------------
var rf = ee.Classifier.smileRandomForest({numberOfTrees: 100, bagFraction: 0.5, seed: 42})
  .train({features: treino, classProperty: 'classe', inputProperties: bandas});

var classificada = imagem.classify(rf).rename('classe_mapa').clip(bacia);

Map.addLayer(imagem, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.15}, 'Sentinel-2 cor natural');
Map.addLayer(classificada, vis, 'Random Forest 2025');


// ---------- 4. IMPORTÂNCIA DAS VARIÁVEIS -----------------------------
var imp = ee.Dictionary(rf.explain().get('importance'));
var tabImp = ee.FeatureCollection(imp.keys().map(function (k) {
  return ee.Feature(null, {variavel: k, importancia: imp.get(k)});
})).sort('importancia', false);

print(ui.Chart.feature.byFeature(tabImp, 'variavel', 'importancia')
  .setChartType('ColumnChart')
  .setOptions({title: 'Importância das variáveis (Random Forest)',
               legend: {position: 'none'}, colors: ['#1a9850']}));

Export.table.toDrive({
  collection: tabImp, description: 'Importancia_variaveis_Pirajibu',
  folder: pasta, fileFormat: 'CSV', selectors: ['variavel', 'importancia']
});


// ---------- 5. FUNÇÃO DE RELATÓRIO DA VALIDAÇÃO -----------------------
// Mostra a matriz como tabela, acurácia global, Kappa, total de amostras
// e as 5 maiores confusões; exporta tudo em CSV.
function relatorio(matriz, titulo, prefixo) {
  ee.Dictionary({m: matriz.array(), oa: matriz.accuracy(), kappa: matriz.kappa()})
    .evaluate(function (r) {
      var m = r.m, n = 0, acertos = 0, erros = [];
      var totCol = classes.map(function () { return 0; });

      var linhas = m.map(function (linha, i) {
        var tot = 0;
        linha.forEach(function (v, j) {
          tot += v; totCol[j] += v;
          if (i === j) acertos += v;
          else if (v > 0) erros.push([nomes[i], nomes[j], v]);
        });
        n += tot;
        return [nomes[i]].concat(linha, [tot]);
      });
      linhas.push(['Total'].concat(totCol, [n]));

      erros.sort(function (a, b) { return b[2] - a[2]; });
      var top5 = erros.slice(0, 5).map(function (e) {
        return e.concat([Math.round(1000 * e[2] / (n - acertos)) / 10]);
      });

      // --- Console ---
      print('════ ' + titulo + ' ════');
      print('Matriz de confusão (linhas = referência · colunas = mapa)');
      print(ui.Chart([['Referência ↓ / Mapa →'].concat(nomes, ['Total'])].concat(linhas), 'Table'));
      print('Acurácia global: ' + (100 * r.oa).toFixed(1) + ' %');
      print('Kappa: ' + r.kappa.toFixed(3));
      print('Total de amostras de validação: ' + n);
      print('As 5 maiores confusões (referência → mapa)');
      print(ui.Chart([['Referência', 'Mapa', 'Amostras', '% dos erros']].concat(top5), 'Table'));

      // --- Exportações CSV ---
      Export.table.toDrive({
        collection: ee.FeatureCollection(linhas.map(function (l) {
          var p = {referencia: l[0], Total: l[l.length - 1]};
          colunas.forEach(function (c, j) { p[c] = l[j + 1]; });
          return ee.Feature(null, p);
        })),
        description: prefixo + '_matriz_confusao_Pirajibu', folder: pasta, fileFormat: 'CSV',
        selectors: ['referencia'].concat(colunas, ['Total'])
      });

      Export.table.toDrive({
        collection: ee.FeatureCollection([ee.Feature(null, {
          acuracia_global: r.oa, kappa: r.kappa, total_amostras: n
        })]),
        description: prefixo + '_resumo_Pirajibu', folder: pasta, fileFormat: 'CSV',
        selectors: ['acuracia_global', 'kappa', 'total_amostras']
      });

      Export.table.toDrive({
        collection: ee.FeatureCollection(top5.map(function (e) {
          return ee.Feature(null, {referencia: e[0], mapa: e[1], amostras: e[2], pct_erros: e[3]});
        })),
        description: prefixo + '_5_maiores_confusoes_Pirajibu', folder: pasta, fileFormat: 'CSV',
        selectors: ['referencia', 'mapa', 'amostras', 'pct_erros']
      });
    });
}


// ---------- 6. VALIDAÇÃO COM AS AMOSTRAS DE TESTE (30%) ---------------
relatorio(
  teste.classify(rf).errorMatrix('classe', 'classification', classes),
  'VALIDAÇÃO – AMOSTRAS DE TESTE (30%)', 'Teste'
);


// ---------- 7. PONTOS PARA VALIDAÇÃO INDEPENDENTE --------------------
// Sorteio aleatório estratificado, PROPORCIONAL à área de cada classe no mapa.
// N_MIN garante que classes pequenas (ex.: Água) não fiquem sem pontos.
var N_TOTAL = 300;
var N_MIN = 10;

var hist = ee.Dictionary(classificada.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(), geometry: bacia,
  scale: 30, maxPixels: 1e13, tileScale: 8
}).get('classe_mapa'));

var totalPix = ee.Number(hist.values().reduce(ee.Reducer.sum()));
var valores  = hist.keys().map(function (k) { return ee.Number.parse(k).int(); });
var nPontos  = hist.values().map(function (v) {
  return ee.Number(v).divide(totalPix).multiply(N_TOTAL).round().max(N_MIN).int();
});
print('Pontos por classe (código: nº de pontos):', ee.Dictionary.fromLists(hist.keys(), nPontos));

var sorteio = classificada.stratifiedSample({
  numPoints: 0, classBand: 'classe_mapa',
  classValues: valores, classPoints: nPontos,
  region: bacia, scale: 10, seed: 7, geometries: true, tileScale: 8
});

var lista = sorteio.toList(sorteio.size());
var pontos = ee.FeatureCollection(ee.List.sequence(1, sorteio.size()).map(function (k) {
  k = ee.Number(k).int();
  var f = ee.Feature(lista.get(k.subtract(1)));
  var xy = f.geometry().transform('EPSG:4326', 1).coordinates();
  return f.set({id: k, longitude: xy.get(0), latitude: xy.get(1), classe_ref: ''});
}));

Map.addLayer(pontos, {color: 'yellow'}, 'Pontos – validação independente');

// KML só com o número do ponto: para interpretar "às cegas" no Google Earth / campo
Export.table.toDrive({
  collection: pontos.select(['id']),
  description: 'Validacao_pontos_KML_Pirajibu', folder: pasta, fileFormat: 'KML'
});

// CSV-ficha: preencher a coluna classe_ref com o código (1 a 6) observado
Export.table.toDrive({
  collection: pontos,
  description: 'Validacao_pontos_ficha_Pirajibu', folder: pasta, fileFormat: 'CSV',
  selectors: ['id', 'longitude', 'latitude', 'classe_mapa', 'classe_ref']
});


// ---------- 8. VALIDAÇÃO INDEPENDENTE A PARTIR DO CSV PREENCHIDO ------
// 1) Preencha classe_ref em TODAS as linhas da ficha (1 Floresta · 2 Herbácea ·
//    3 Silvicultura · 4 Agropecuária · 5 Não vegetada · 6 Água).
// 2) Suba o CSV em Assets › NEW › CSV file e cole o caminho abaixo.
var ASSET_VALIDACAO = '';   // ex.: 'projects/seu-projeto/assets/Validacao_pontos_preenchida'

if (ASSET_VALIDACAO) {
  var independente = ee.FeatureCollection(ASSET_VALIDACAO).map(function (f) {
    return f.set({
      classe_ref:  ee.Number(f.get('classe_ref')).int(),
      classe_mapa: ee.Number(f.get('classe_mapa')).int()
    });
  });
  relatorio(
    independente.errorMatrix('classe_ref', 'classe_mapa', classes),
    'VALIDAÇÃO INDEPENDENTE (CSV interpretado)', 'Independente'
  );
}
