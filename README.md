# Geotecnologias Aplicadas — Scripts das Aulas

Repositório de scripts utilizados nas aulas práticas de **Geotecnologias Aplicadas**, abrangendo Sensoriamento Remoto, Aprendizado de Máquina e Modelagem de Mudanças do Uso do Solo.

**Área de estudo:** Bacia do Pirajibu-Mirim, Sorocaba/SP, Brasil
**Dados principais:** Sentinel-2 (ESA), MapBiomas Col. 9, Drone DJI Mavic 3M

---

## Plataformas utilizadas

| Ícone | Plataforma | Linguagem | Como acessar |
|-------|-----------|-----------|--------------|
| 🌍 | **Google Earth Engine (GEE)** | JavaScript | [code.earthengine.google.com](https://code.earthengine.google.com/) |
| 🐍 | **Google Colab** | Python | [colab.research.google.com](https://colab.research.google.com/) |

> **GEE:** cole o conteúdo do arquivo `.js` diretamente no editor do GEE e clique em *Run*.
> **Colab:** abra o `.ipynb` ou `.py` no Google Colab; GPU recomendada para aulas 08, 09 e 10.

---

## Estrutura por Aula

### Aula 02 — Exportação de Banda Sentinel-2
📁 `aula02_exportacao_banda/`
🌍 GEE | `gee_exportacao_banda.js`

Exporta uma banda individual (B2 — azul) do Sentinel-2 para o Google Drive como GeoTIFF (10 m). Ponto de partida para familiarização com o GEE.

---

### Aula 03 — Série Temporal de Índices Espectrais
📁 `aula03_series_temporais/`
🌍 GEE | `gee_series_temporais_indices.js`

Calcula séries temporais mensais de NDVI, NDWI e NDBI para a bacia (2023–2025). Exporta gráficos, tabelas CSV e GeoTIFF multibanda.

---

### Aula 04 — Previsão de NDVI com Rede Neural (MLP)
📁 `aula04_previsao_ndvi/`
🐍 Colab | `colab_previsao_ndvi_mlp.ipynb`

Treina um MLP (scikit-learn) para prever o NDVI do mês seguinte a partir dos 3 meses anteriores. Avalia R², MAE e RMSE; gera mapas de erro para identificar anomalias de vegetação.

---

### Aula 06 — Classificação LULC com Random Forest
📁 `aula06_classificacao_rf/`
🌍 GEE | `gee_classificacao_random_forest.js`

Classifica 6 classes de uso e cobertura do solo usando Random Forest (100 árvores, 9 atributos Sentinel-2). Amostras extraídas de pixels estáveis do MapBiomas; avalia com matriz de confusão e importância de variáveis.

---

### Aula 07 — Validação por Blocos Espaciais
📁 `aula07_validacao/`
🌍 GEE | `gee_validacao_classificacao.js`

Valida a classificação da Aula 06 com amostras independentes alocadas por blocos espaciais (384 m × 384 m), evitando autocorrelação espacial. Calcula Kappa, acurácias de produtor e usuário.

---

### Aula 08 — Segmentação Semântica com U-Net
📁 `aula08_unet/`
🌍 GEE | `gee_preparo_dados_unet.js` → prepara o stack de 11 bandas
🐍 Colab | `colab_unet_segmentacao.ipynb` → treina e avalia a U-Net

Pipeline completo em dois passos:
1. **GEE:** exporta stack (9 features + labels MapBiomas + máscara da bacia) para o Drive
2. **Colab:** treina U-Net (ResNet-34 encoder, PyTorch) com tiles 128×128, validação espacial e inferência por janela deslizante

---

### Aula 09 — Detecção e Agrupamento de Copas (Drone)
📁 `aula09_deteccao_copas/`
🐍 Colab | `colab_deteccao_copas.ipynb`

Detecta copas de árvores em ortomosaico de drone (DJI Mavic 3M, 10 cm) com DeepForest/detectree2. Extrai atributos espectrais por copa e agrupa em morfotipos via K-means (silhueta para escolha de k). Gera GeoPackage curado para a Aula 10.

---

### Aula 10 — Classificação de Morfotipos com CNN
📁 `aula10_morfotipos/`
🐍 Colab | `colab_classificacao_morfotipos.py`

Treina EfficientNet-B0 para classificar morfotipos de copas (patches 96×96 px). Compara RGB vs. multiespectral (5 bandas). Implementa aprendizado ativo: identifica as 20 copas mais incertas para anotação manual.

---

### Aula 12 — Modelagem de Mudanças do Uso do Solo (LCM)
📁 `aula12_modelagem_mudancas/`
🐍 Colab | `colab_land_change_modeler.ipynb`

Replica o Land Change Modeler (TerrSet) em Python open-source. Etapas: análise de transições → potenciais de transição (MLPs) → demanda (Markov) → alocação competitiva → validação (Figure of Merit) → projeção de cenário 2040.

---

## Sequência recomendada

```
Aula 02 → Aula 03 → Aula 04 → Aula 06 → Aula 07 → Aula 08 → Aula 09 → Aula 10 → Aula 12
  (GEE)     (GEE)    (Colab)    (GEE)     (GEE)      (GEE+Colab)  (Colab)   (Colab)   (Colab)
```

## Dados necessários

Os dados de entrada **não estão incluídos** neste repositório por serem grandes demais. Antes de rodar os scripts, você precisará:

| Dado | Fonte | Onde usar |
|------|-------|-----------|
| Geometria da bacia (`bacia`) | Definir como asset no GEE | Aulas 03, 06, 07, 08 |
| Geometria de Sorocaba (`sorocaba`) | Definir como asset no GEE | Aulas 02, 06 |
| Ortomosaico RGB (drone) | DJI Mavic 3M — campo | Aulas 09, 10 |
| Ortomosaico multiespectral (drone) | DJI Mavic 3M — campo | Aulas 09, 10 |
| Rasters LULC (1995, 2010, 2025) | MapBiomas / Drive | Aula 12 |
