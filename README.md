# Mining Area Monitoring – Rembang

**Satellite-Based Land Cover Mapping and Potential Mining Area Screening**

Rembang Regency, Central Java, Indonesia | 2018–2025

## Project Overview

This project uses Google Earth Engine (GEE) and multi-temporal satellite imagery to map land-cover patterns and screen for potential mining-related surface changes in Rembang Regency, Central Java, Indonesia.

The workflow combines Sentinel-2 Surface Reflectance imagery, Random Forest classification, and Google Dynamic World data.

## Interactive Dashboard

[Open Google Earth Engine Dashboard](https://robbydarmawansyah.users.earthengine.app/view/mining-area-monitoring---rembang)

## Objectives

- Map land-cover classes using satellite imagery.
- Generate annual land-cover classification outputs.
- Analyze land-cover area statistics and selected transitions.
- Compare Random Forest results with Dynamic World.
- Identify potential bare/open-land areas for further inspection.
- Develop an interactive monitoring dashboard.

## Data Sources

- Sentinel-2 Surface Reflectance Harmonized
- Google Dynamic World
- FAO GAUL Level 2 Administrative Boundaries
- SRTM Digital Elevation Model

## Methodology

1. Study area delineation.
2. Sentinel-2 image collection and cloud masking.
3. Seasonal composite generation (June–September).
4. NDVI calculation.
5. Training and validation sample preparation.
6. Random Forest classification.
7. Annual land-cover analysis (2018–2025).
8. Dynamic World comparison.
9. Potential bare/open-land candidate extraction.
10. Interactive dashboard development.

## Land-Cover Classes

| Class ID | Class |
|---|---|
| 0 | Vegetation |
| 1 | Agriculture |
| 2 | Bare / Open Land |
| 3 | Built-up |
| 4 | Water |

## Key Outputs

- Annual land-cover classification maps.
- Land-cover area statistics.
- Selected land-cover transition summaries.
- Potential bare/open-land candidate polygons.
- Interactive Google Earth Engine dashboard.

## Important Methodological Notes

Bare/open land should not automatically be interpreted as active mining. Exposed soil, construction sites, and dry agricultural fields may have similar spectral characteristics.

The Random Forest model was trained using 2025 samples and applied retrospectively to earlier years. Therefore, temporal comparisons may be affected by differences in spectral conditions and class representation.

Candidate areas are preliminary screening results, not confirmed mining locations, official mining boundaries, or IUP permit boundaries.

## Tools & Technologies

- Google Earth Engine
- JavaScript
- Sentinel-2
- Dynamic World
- Random Forest
- QGIS
- Google Earth Pro
- Remote Sensing and GIS

## Repository Structure

```text
mining-area-monitoring-rembang/
│
├── README.md
├── LICENSE
│
├── scripts/
│   └── gee_mining_area_monitoring.js
│
├── docs/
│   ├── methodology.md
│   └── results.md
│
└── outputs/
    └── tables/
        ├── regional/
        │   └── rembang_annual_landcover_statistics.csv
        │
        └── saf_pilot_area/
            ├── SAF_Candidate_Rangking_2025.csv
            ├── SAF_Candidate_Temporal_Monitoring_2018_2025.csv
            ├── SAF_Change_Area_Statistics_2018_2025.csv
            ├── SAF_Corrected_Temporal_Statistics.csv
            ├── SAF_Full_Transition_Matrix_2018_2025.csv
            └── SAF_LandCover_2018_2025.csv

## Author

**Robby Darmawansyah, S.T.**  
Geomatics Engineering | GIS & Remote Sensing

---

Project status: Prototype completed; further validation and refinement are ongoing.
