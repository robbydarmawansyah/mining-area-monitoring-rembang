# Methodology

## 1. Study Area

The study area covers Rembang Regency, Central Java, Indonesia. A pilot assessment focuses on a limestone quarry landscape in Sale District.

## 2. Satellite Data

### Sentinel-2 Surface Reflectance

Sentinel-2 Surface Reflectance Harmonized imagery is used to derive annual seasonal composites.

- Collection: COPERNICUS/S2_SR_HARMONIZED
- Analysis period: 2018–2025
- Seasonal window: June–September
- Cloud masking: Scene Classification Layer (SCL)

### Dynamic World

Google Dynamic World is used as an additional land-cover reference for comparison and potential bare-surface screening.

## 3. Image Preprocessing

Cloud and cloud-shadow pixels are masked before generating annual median composites.

Spectral bands used include:

- Blue (B2)
- Green (B3)
- Red (B4)
- Near Infrared (B8)
- SWIR 1 (B11)
- SWIR 2 (B12)

## 4. Land-Cover Classification

A Random Forest classifier is trained using interpreted polygon samples.

Five classes are mapped:

1. Vegetation
2. Agriculture
3. Bare / Open Land
4. Built-up
5. Water

The dataset is divided into training and validation polygon samples.

## 5. Annual Analysis

Annual land-cover maps are generated for 2018–2025. Class areas are calculated to examine spatial patterns and potential changes over time.

## 6. Potential Bare/Open-Land Screening

Potential candidate areas are screened by combining:

- Random Forest classification results.
- Dynamic World bare-ground labels.
- Connected pixel analysis.
- Minimum patch-area filtering.

The resulting polygons are preliminary candidates that require visual interpretation and independent verification.

## 7. Interactive Dashboard

An interactive Google Earth Engine application provides map visualization, year selection, candidate selection, and supporting statistics.

## 8. Limitations

The Random Forest model was trained using 2025 samples and applied retrospectively to earlier years. This may introduce temporal classification inconsistencies.

Bare/open land does not necessarily represent mining activity. Independent reference data and multi-date image interpretation are required before identifying confirmed mining locations.
