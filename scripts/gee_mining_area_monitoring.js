
// ==========================================
// PROJECT: MINING AREA MONITORING
// LOCATION: REMBANG, CENTRAL JAVA
// GOOGLE EARTH ENGINE
// ==========================================

// 1. LOAD ADMINISTRATIVE BOUNDARY
var admin = ee.FeatureCollection(
  'FAO/GAUL/2015/level2'
);

// 2. FILTER INDONESIA
var indonesia = admin.filter(
  ee.Filter.eq('ADM0_NAME', 'Indonesia')
);

// 3. FILTER KABUPATEN REMBANG
var roiFc = indonesia.filter(
  ee.Filter.eq('ADM2_NAME', 'Rembang')
);

// 4. DEFINE AREA OF INTEREST
var roi = roiFc.geometry();

// 5. DISPLAY INFORMATION
print('Area of Interest:', roiFc);
print('Jumlah fitur:', roiFc.size());
print(
  'Provinsi:',
  roiFc.aggregate_array('ADM1_NAME')
);

// 6. DISPLAY MAP
Map.centerObject(roi, 10);

Map.addLayer(
  roiFc.style({
    color: 'FF0000',
    fillColor: '00000000',
    width: 2
  }),
  {},
  'Study Area - Rembang'
);


// ==========================================
// STAGE 2: SATELLITE IMAGE PROCESSING
// ==========================================

// TIME PERIOD
var startDate = '2018-01-01';
var endDate = '2027-01-01';

// ------------------------------------------
// A. SENTINEL-2 CLOUD MASKING
// ------------------------------------------

var s2 = ee.ImageCollection(
  'COPERNICUS/S2_SR_HARMONIZED'
)
.filterBounds(roi)
.filterDate(startDate, endDate)
.filter(ee.Filter.lt(
  'CLOUDY_PIXEL_PERCENTAGE', 40
));

function maskClouds(image) {

  var scl = image.select('SCL');

  var mask = scl.neq(3)
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));

  return image.updateMask(mask)
    .divide(10000)
    .copyProperties(image, ['system:time_start']);
}

// APPLY CLOUD MASK
var s2Masked = s2.map(maskClouds);


// ======================================
// OPTIMIZED SENTINEL-2 COMPOSITE
// ======================================

function getS2Composite(year) {

  var start = ee.Date.fromYMD(year, 6, 1);

  var end = ee.Date.fromYMD(year, 10, 1);

  var bands = [
    'B2', 'B3', 'B4',
    'B8', 'B11', 'B12'
  ];

  var collection = s2Masked
    .filterDate(start, end)
    .select(bands);

  return collection
    .median()
    .clip(roi);
}

// ==========================================
// CHECK SENTINEL-2 IMAGE AVAILABILITY
// ==========================================

var yearsCheck = ee.List.sequence(2018, 2025);

var imageAvailability = ee.FeatureCollection(
  yearsCheck.map(function(year) {

    year = ee.Number(year);

    var start = ee.Date.fromYMD(year, 6, 1);
    var end = ee.Date.fromYMD(year, 10, 1);

    var collection = s2Masked
      .filterBounds(roi)
      .filterDate(start, end);

    return ee.Feature(null, {
      year: year,
      image_count: collection.size()
    });

  })
);

print('SENTINEL-2 IMAGE AVAILABILITY:', imageAvailability);

// CHECK IMAGE AVAILABILITY

var check2025 = s2Masked
  .filterDate('2025-06-01', '2025-10-01')
  .select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']);

print(
  'Sentinel-2 Images June-September 2025:',
  check2025.size()
);

// ------------------------------------------
// C. NDVI CALCULATION
// ------------------------------------------

var s2_2025 = getS2Composite(2025);

var ndvi = s2_2025.normalizedDifference(
  ['B8', 'B4']
).rename('NDVI');

// VISUALIZATION NDVI
var ndviVis = {
  min: -0.2,
  max: 0.8,
  palette: [
    '8c510a',
    'd8b365',
    'f6e8c3',
    'a6d96a',
    '1a9850'
  ]
};

Map.addLayer(
  ndvi,
  ndviVis,
  'NDVI 2025'
);

// ------------------------------------------
// D. DYNAMIC WORLD
// ------------------------------------------

var dw = ee.ImageCollection(
  'GOOGLE/DYNAMICWORLD/V1'
)
.filterBounds(roi);

// ANNUAL DYNAMIC WORLD
function getDWComposite(year) {

  var start = ee.Date.fromYMD(year, 1, 1);

  var end = start.advance(1, 'year');

  var collection = dw.filterDate(
    start, end
  );

  // Dominant land cover class
  var label = collection
    .select('label')
    .mode()
    .rename('label');

  // Bare surface probability
  var bareProbability = collection
    .select('bare')
    .median()
    .rename('bare_probability');

  // Candidate bare land
  var bare = label.eq(7)
    .and(bareProbability.gte(0.45))
    .selfMask()
    .rename('bare_candidate');

  return ee.Image.cat([
    label,
    bareProbability,
    bare
  ]).clip(roi);
}

// GET 2025 IMAGE
var dw2025 = getDWComposite(2025);

// DISPLAY BARE SURFACE
Map.addLayer(
  dw2025.select('bare_candidate'),
  {palette: ['FF4500']},
  'Bare Surface Candidate 2025'
);

print('Sentinel-2 collection:', s2);
print('Dynamic World collection:', dw);
print('NDVI 2025:', ndvi);
print('Bare Surface 2025:', dw2025);


// ==========================================
// STAGE 3: CHANGE DETECTION
// ==========================================

// YEARS
var years = ee.List.sequence(2018, 2026);

// ------------------------------------------
// ANNUAL BARE SURFACE AREA
// ------------------------------------------

var annualStats = ee.FeatureCollection(
  years.map(function(year) {

    year = ee.Number(year);

    var image = getDWComposite(year);

    var bareMask = image.select(
      'bare_candidate'
    );

    // PIXEL AREA IN HECTARES
    var areaImage = ee.Image.pixelArea()
      .divide(10000)
      .updateMask(bareMask);

    var area = areaImage.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: roi,
      scale: 10,
      maxPixels: 1e13,
      tileScale: 4
    });

    var areaHa = area.get('area');

    return ee.Feature(null, {
      year: year,
      bare_ha: areaHa
    });

  })
);

print(
  'Annual Bare Surface Statistics:',
  annualStats
);

// ------------------------------------------
// CHART
// ------------------------------------------

var chart = ui.Chart.feature.byFeature(
  annualStats,
  'year',
  ['bare_ha']
)
.setChartType('LineChart')
.setOptions({

  title: 'Annual Bare Surface Area (2018-2026)',

  hAxis: {
    title: 'Year',
    format: '####'
  },

  vAxis: {
    title: 'Area (Hectares)'
  },

  lineWidth: 2,
  pointSize: 5,

  legend: {
    position: 'none'
  }

});

print(chart);

// ------------------------------------------
// EXPORT STATISTICS
// ------------------------------------------

Export.table.toDrive({

  collection: annualStats,

  description: 'Rembang_Mining_Monitoring_Statistics',

  fileFormat: 'CSV'

});


// ==========================================
// STAGE 4: INTERACTIVE GEE DASHBOARD
// ==========================================

// DASHBOARD PANEL
var panel = ui.Panel({
  style: {
    width: '340px',
    padding: '12px'
  }
});

// TITLE
panel.add(ui.Label({
  value: 'MINING AREA MONITORING',
  style: {
    fontSize: '19px',
    fontWeight: 'bold'
  }
}));

panel.add(ui.Label(
  'Rembang, Central Java, Indonesia'
));

panel.add(ui.Label(
  'Satellite-based land monitoring | 2018-2026'
));

// YEAR SELECTOR
panel.add(ui.Label({
  value: 'Select Analysis Year',
  style: {
    fontWeight: 'bold',
    margin: '15px 0 5px 0'
  }
}));

var yearSelect = ui.Select({

  items: [
    '2018', '2019', '2020',
    '2021', '2022', '2023',
    '2024', '2025', '2026'
  ],

  value: '2025',

  onChange: updateMap

});

panel.add(yearSelect);

// RESULT LABEL
var resultLabel = ui.Label(
  'Loading analysis...'
);

panel.add(resultLabel);

// UPDATE MAP
function updateMap(year) {

  var selectedYear = parseInt(year, 10);

  var dwImage = getDWComposite(selectedYear);

  var s2Image = getS2Composite(selectedYear);

  var ndviImage = s2Image.normalizedDifference(
    ['B8', 'B4']
  );

  // RESET MAP
  Map.layers().reset();

  // BOUNDARY
  Map.addLayer(
    roiFc.style({
      color: 'FFFFFF',
      fillColor: '00000000',
      width: 2
    }),
    {},
    'Study Area'
  );

  // NDVI
  Map.addLayer(
    ndviImage,
    {
      min: -0.2,
      max: 0.8,
      palette: [
        '8c510a',
        'd8b365',
        'f6e8c3',
        'a6d96a',
        '1a9850'
      ]
    },
    'NDVI ' + year
  );

  // BARE SURFACE
  Map.addLayer(
    dwImage.select('bare_candidate'),
    {
      palette: ['FF4500']
    },
    'Bare Surface ' + year
  );

  // CALCULATE AREA
  var areaImage = ee.Image.pixelArea()
    .divide(10000)
    .updateMask(
      dwImage.select('bare_candidate')
    );

  var area = areaImage.reduceRegion({

    reducer: ee.Reducer.sum(),

    geometry: roi,

    scale: 10,

    maxPixels: 1e13,

    tileScale: 4

  });

  area.get('area').evaluate(function(value) {

    var text = value === null
      ? 'No valid data'
      : value.toFixed(2) + ' hectares';

    resultLabel.setValue(
      'Bare Surface Candidate ' +
      year + ': ' + text
    );

  });

}

// INITIALIZE DASHBOARD
updateMap('2025');

// CHART
panel.add(ui.Label({
  value: 'Annual Area Statistics',
  style: {
    fontWeight: 'bold',
    margin: '20px 0 5px 0'
  }
}));

var areaChart = ui.Chart.feature.byFeature(
  annualStats,
  'year',
  ['bare_ha']
)
.setChartType('ColumnChart')
.setOptions({

  title: 'Bare Surface Area (ha)',

  hAxis: {
    title: 'Year',
    format: '####'
  },

  vAxis: {
    title: 'Area (ha)'
  },

  legend: {
    position: 'none'
  }

});

panel.add(areaChart);

// DISCLAIMER
panel.add(ui.Label({
  value:
    'Note: Bare surface is an indicator of exposed land, ' +
    'not a verified mining footprint.',
  style: {
    fontSize: '10px',
    color: '666666',
    margin: '15px 0 0 0'
  }
}));

// ADD PANEL TO UI
ui.root.insert(0, panel);


// ======================================
// TRAINING DATA PREPARATION
// ======================================

// Sentinel-2 composite 2025
var trainingImage = getS2Composite(2025);

// RGB visualization
var rgbVis = {
  bands: ['B4', 'B3', 'B2'],
  min: 0.02,
  max: 0.30,
  gamma: 1.2
};

// Display satellite image
Map.addLayer(
  trainingImage,
  rgbVis,
  'Sentinel-2 RGB 2025'
);

// Focus on study area
Map.centerObject(roi, 10);


// ==========================================
// STAGE 5: TRAINING DATA PREPARATION
// REMBANG MINING AREA MONITORING
// ==========================================

// 1. ASSIGN CLASS TO EACH IMPORTED LAYER

var vegetationSamples = ee.Feature(
  Vegetation,
  {class: 0}
);

var agricultureSamples = ee.Feature(
  agriculture,
  {class: 1}
);

var miningSamples = ee.Feature(
  mining,
  {class: 2}
);

var builtupSamples = ee.Feature(
  builtup,
  {class: 3}
);

var waterSamples = ee.Feature(
  water,
  {class: 4}
);

// 2. MERGE ALL TRAINING POLYGONS

var trainingPolygons = ee.FeatureCollection([
  vegetationSamples,
  agricultureSamples,
  miningSamples,
  builtupSamples,
  waterSamples
]);

// 3. CHECK TRAINING DATA

print('Training Polygons:', trainingPolygons);

print(
  'Number of Training Layers:',
  trainingPolygons.size()
);

// 4. DISPLAY TRAINING DATA

Map.addLayer(
  trainingPolygons,
  {},
  'Random Forest Training Samples'
);


// ==========================================
// STAGE 7: POLYGON-BASED DATA SPLITTING
// ==========================================

// Convert each multipart geometry into individual features

function makeClassPolygons(geometry, classValue, className) {

  var parts = ee.List(geometry.geometries());

  return ee.FeatureCollection(
    parts.map(function(part) {

      return ee.Feature(
        ee.Geometry(part),
        {
          class: classValue,
          class_name: className
        }
      );

    })
  );
}

// Convert the 5 imported geometry layers

var rfVegetation = makeClassPolygons(
  Vegetation, 0, 'Vegetation'
);

var rfAgriculture = makeClassPolygons(
  agriculture, 1, 'Agriculture'
);

var rfMining = makeClassPolygons(
  mining, 2, 'Bare Soil / Mining'
);

var rfBuiltup = makeClassPolygons(
  builtup, 3, 'Built-up'
);

var rfWater = makeClassPolygons(
  water, 4, 'Water'
);

// Merge all individual polygons

var rfAllPolygons = rfVegetation
  .merge(rfAgriculture)
  .merge(rfMining)
  .merge(rfBuiltup)
  .merge(rfWater);

// Check actual polygon numbers

print('Vegetation polygons:', rfVegetation.size());
print('Agriculture polygons:', rfAgriculture.size());
print('Mining polygons:', rfMining.size());
print('Built-up polygons:', rfBuiltup.size());
print('Water polygons:', rfWater.size());

print('TOTAL INDIVIDUAL POLYGONS:', rfAllPolygons.size());

// Random split by polygon, not by pixel

var rfRandomPolygons = rfAllPolygons.randomColumn(
  'split',
  42
);

// 70% training, 30% validation

var rfTrainPolygons = rfRandomPolygons.filter(
  ee.Filter.lt('split', 0.7)
);

var rfValidationPolygons = rfRandomPolygons.filter(
  ee.Filter.gte('split', 0.7)
);

print(
  'Training polygon count:',
  rfTrainPolygons.size()
);

print(
  'Validation polygon count:',
  rfValidationPolygons.size()
);

print(
  'Training classes:',
  rfTrainPolygons.aggregate_histogram('class')
);

print(
  'Validation classes:',
  rfValidationPolygons.aggregate_histogram('class')
);


// ==========================================
// STAGE 8: SPECTRAL PIXEL EXTRACTION
// ==========================================

// Input image

var rfBands = [
  'B2', 'B3', 'B4',
  'B8', 'B11', 'B12'
];

var rfImage = getS2Composite(2025)
  .select(rfBands);

// Extract training pixels

var rfTrainingPixels = rfImage.sampleRegions({

  collection: rfTrainPolygons,

  properties: ['class', 'class_name'],

  scale: 20,

  tileScale: 4,

  geometries: false

});

// Extract independent validation pixels

var rfValidationPixels = rfImage.sampleRegions({

  collection: rfValidationPolygons,

  properties: ['class', 'class_name'],

  scale: 20,

  tileScale: 4,

  geometries: false

});

// Check sample size

print('Training pixels:', rfTrainingPixels.size());

print('Validation pixels:', rfValidationPixels.size());

// Check class distribution

print(
  'Training pixel distribution:',
  rfTrainingPixels.aggregate_histogram('class')
);

print(
  'Validation pixel distribution:',
  rfValidationPixels.aggregate_histogram('class')
);


// ==========================================
// STAGE 9: RANDOM FOREST CLASSIFICATION
// ==========================================

// Create Random Forest model

var rfClassifier = ee.Classifier.smileRandomForest(
  100,  // Number of trees
  null, // Variables per split
  1,    // Minimum leaf population
  0.7,  // Bag fraction
  null, // Maximum nodes
  42    // Random seed
).train({

  features: rfTrainingPixels,

  classProperty: 'class',

  inputProperties: rfBands

});

// Display model information

print(
  'Random Forest Model:',
  rfClassifier
);

print(
  'Model Information:',
  rfClassifier.explain()
);

// Apply classification

var rfClassified = rfImage
  .classify(rfClassifier)
  .clip(roi);

// Visualization

var rfPalette = [
  '006400', // Vegetation
  'FFFF00', // Agriculture
  'FF0000', // Bare Soil / Mining
  '808080', // Built-up
  '0000FF'  // Water
];

// Display classification map

Map.addLayer(
  rfClassified,
  {
    min: 0,
    max: 4,
    palette: rfPalette
  },
  'Random Forest Classification 2025'
);


// ==========================================
// STAGE 10: ACCURACY ASSESSMENT
// ==========================================

// Classify independent validation pixels

var rfValidated = rfValidationPixels.classify(
  rfClassifier
);

// Generate confusion matrix

var rfConfusionMatrix = rfValidated.errorMatrix(
  'class',
  'classification',
  [0, 1, 2, 3, 4]
);

// Print confusion matrix

print(
  'CONFUSION MATRIX:',
  rfConfusionMatrix
);

// Overall accuracy

print(
  'OVERALL ACCURACY:',
  rfConfusionMatrix.accuracy()
);

// Kappa coefficient

print(
  'KAPPA COEFFICIENT:',
  rfConfusionMatrix.kappa()
);

// Producer accuracy

print(
  'PRODUCER ACCURACY:',
  rfConfusionMatrix.producersAccuracy()
);

// User accuracy

print(
  'USER ACCURACY:',
  rfConfusionMatrix.consumersAccuracy()
);


// ==========================================
// STAGE 11: LAND COVER AREA CALCULATION
// ==========================================

// 1. PIXEL AREA IN HECTARES

var pixelArea = ee.Image.pixelArea()
  .divide(10000)
  .rename('area_ha');

// 2. COMBINE AREA AND CLASSIFICATION

var areaImage = pixelArea.addBands(
  rfClassified.rename('class')
);

// 3. CALCULATE AREA BY CLASS

var areaResult = areaImage.reduceRegion({

  reducer: ee.Reducer.sum().group({

    groupField: 1,

    groupName: 'class'

  }),

  geometry: roi,

  scale: 20,

  maxPixels: 1e13,

  tileScale: 4

});

print(
  'LAND COVER AREA RESULT:',
  areaResult
);

// 4. CONVERT RESULT TO FEATURE COLLECTION

var classNames = ee.List([
  'Vegetation',
  'Agriculture',
  'Bare Soil / Mining',
  'Built-up',
  'Water'
]);

var areaGroups = ee.List(
  areaResult.get('groups')
);

var areaTable = ee.FeatureCollection(
  areaGroups.map(function(item) {

    var dictionary = ee.Dictionary(item);

    var classValue = ee.Number(
      dictionary.get('class')
    );

    return ee.Feature(null, {

      class_id: classValue,

      class_name: classNames.get(
        classValue
      ),

      area_ha: dictionary.get('sum')

    });

  })
);

// 5. PRINT TABLE

print('LAND COVER AREA TABLE:', areaTable);

// 6. CREATE BAR CHART

var areaChart = ui.Chart.feature.byFeature(
  areaTable,
  'class_name',
  ['area_ha']
)
.setChartType('ColumnChart')
.setOptions({

  title: 'Land Cover Area Distribution - 2025',

  hAxis: {
    title: 'Land Cover Class',
    slantedText: true,
    slantedTextAngle: 30
  },

  vAxis: {
    title: 'Area (Hectares)'
  },

  legend: {
    position: 'none'
  },

  bar: {
    groupWidth: '65%'
  }

});

print(areaChart);

// 7. EXPORT STATISTICS TO CSV

Export.table.toDrive({

  collection: areaTable,

  description: 'Rembang_RF_LandCover_Area_2025',

  fileFormat: 'CSV'

});



// ==========================================
// STAGE 12: EXPORT CLASSIFICATION MAP
// ==========================================

Export.image.toDrive({

  image: rfClassified.toByte(),

  description: 'Rembang_RF_Classification_2025',

  folder: 'GEE_Mining_Monitoring',

  fileNamePrefix: 'Rembang_LandCover_2025',

  region: roi,

  scale: 20,

  crs: 'EPSG:32749',

  maxPixels: 1e13

});


// ==========================================
// STAGE 13: AOI AREA VALIDATION
// ==========================================

// Calculate vector boundary area

var roiAreaHa = roi.area(1).divide(10000);

// Calculate classified raster area

var classifiedAreaHa = ee.Number(
  areaTable.aggregate_sum('area_ha')
);

// Calculate area difference

var difference = classifiedAreaHa.subtract(
  roiAreaHa
);

// Percentage difference

var percentageDifference = difference
  .divide(roiAreaHa)
  .multiply(100);

print('AOI Vector Area (ha):', roiAreaHa);

print(
  'Classified Raster Area (ha):',
  classifiedAreaHa
);

print('Area Difference (ha):', difference);

print(
  'Area Difference (%):',
  percentageDifference
);


// ==========================================
// STAGE 14: ANNUAL CLASSIFICATION
// ==========================================

// Years 2018-2025
var monitoringYears = ee.List.sequence(2018, 2025);

// Sentinel-2 bands
var monitoringBands = [
  'B2', 'B3', 'B4',
  'B8', 'B11', 'B12'
];

// Create annual classification collection
var annualClassification = ee.ImageCollection.fromImages(

  monitoringYears.map(function(year) {

    year = ee.Number(year);

    // Annual Sentinel-2 composite
    var annualImage = getS2Composite(year)
      .select(monitoringBands);

    // Apply trained Random Forest
    var classified = annualImage
      .classify(rfClassifier)
      .rename('class')
      .toByte()
      .clip(roi);

    return classified.set({
      'year': year,
      'system:time_start':
        ee.Date.fromYMD(year, 6, 1).millis()
    });

  })

);

// Check results
print(
  'Annual Classification:',
  annualClassification
);

print(
  'Number of Annual Images:',
  annualClassification.size()
);

// ==========================================
// COMPARE CLASSIFICATION 2018 AND 2025
// ==========================================

var classification2018 = ee.Image(
  annualClassification
    .filter(ee.Filter.eq('year', 2018))
    .first()
);

var classification2025 = ee.Image(
  annualClassification
    .filter(ee.Filter.eq('year', 2025))
    .first()
);

var classVis = {
  min: 0,
  max: 4,
  palette: [
    '006400',
    'FFFF00',
    'FF0000',
    '808080',
    '0000FF'
  ]
};

Map.addLayer(
  classification2018,
  classVis,
  'Classification 2018',
  true
);

Map.addLayer(
  classification2025,
  classVis,
  'Classification 2025',
  false
);


// ================================================
// STAGE 15: ANNUAL LAND COVER AREA STATISTICS
// PERIOD: 2018 - 2025
// ================================================

// 1. CLASS NAMES

var classNames = ee.List([
  'Vegetation',
  'Agriculture',
  'Bare Soil / Mining',
  'Built-up',
  'Water'
]);

// 2. CALCULATE AREA FOR EACH YEAR

var annualAreaStatistics = ee.FeatureCollection(
  monitoringYears.map(function(year) {

    year = ee.Number(year);

    // Get annual classification
    var image = ee.Image(
      annualClassification
        .filter(ee.Filter.eq('year', year))
        .first()
    );

    // Combine pixel area and classification
    var areaImage = ee.Image.pixelArea()
      .divide(10000)
      .rename('area_ha')
      .addBands(image.rename('class'));

    // Group area by land cover class
    var result = areaImage.reduceRegion({

      reducer: ee.Reducer.sum().group({
        groupField: 1,
        groupName: 'class'
      }),

      geometry: roi,

      scale: 20,

      maxPixels: 1e13,

      tileScale: 4

    });

    var groups = ee.List(
      ee.Dictionary(result).get('groups', ee.List([]))
    );

    // Convert grouped result to features
    return ee.FeatureCollection(
      groups.map(function(item) {

        var dictionary = ee.Dictionary(item);

        var classID = ee.Number(
          dictionary.get('class')
        );

        return ee.Feature(null, {

          year: year,

          class_id: classID,

          class_name: classNames.get(classID),

          area_ha: dictionary.get('sum')

        });

      })
    );

  })
).flatten();

// 3. PRINT ANNUAL STATISTICS

print(
  'ANNUAL LAND COVER STATISTICS 2018-2025:',
  annualAreaStatistics
);

// 4. FILTER BARE SOIL / MINING

var bareStatistics = annualAreaStatistics.filter(
  ee.Filter.eq('class_id', 2)
);

print(
  'ANNUAL BARE SOIL / MINING AREA:',
  bareStatistics
);

// 5. CREATE ANNUAL TREND CHART

var miningTrendChart = ui.Chart.feature.byFeature(
  bareStatistics,
  'year',
  ['area_ha']
)
.setChartType('LineChart')
.setOptions({

  title: 'Bare Soil / Mining Area Trend (2018-2025)',

  hAxis: {
    title: 'Year',
    format: '####'
  },

  vAxis: {
    title: 'Area (Hectares)'
  },

  lineWidth: 3,

  pointSize: 6,

  legend: {
    position: 'none'
  }

});

print(miningTrendChart);

// 6. EXPORT CSV

Export.table.toDrive({

  collection: annualAreaStatistics,

  description: 'Rembang_Annual_LandCover_2018_2025',

  folder: 'GEE_Mining_Monitoring',

  fileNamePrefix: 'Rembang_Annual_LandCover_Statistics',

  fileFormat: 'CSV'

});


// ==========================================
// STAGE 16A: TEMPORAL CLASSIFICATION CHECK
// ==========================================

var temporalCheck = ee.FeatureCollection(
  monitoringYears.map(function(year) {

    year = ee.Number(year);

    // Get annual classification
    var image = ee.Image(
      annualClassification
        .filter(ee.Filter.eq('year', year))
        .first()
    );

    // Calculate valid classified area
    var validAreaImage = ee.Image.pixelArea()
      .divide(10000)
      .rename('area')
      .updateMask(image.mask());

    var validResult = validAreaImage.reduceRegion({

      reducer: ee.Reducer.sum(),

      geometry: roi,

      scale: 20,

      maxPixels: 1e13,

      tileScale: 4

    });

    // Calculate Bare Soil / Mining area
    var bareAreaImage = ee.Image.pixelArea()
      .divide(10000)
      .rename('area')
      .updateMask(image.eq(2));

    var bareResult = bareAreaImage.reduceRegion({

      reducer: ee.Reducer.sum(),

      geometry: roi,

      scale: 20,

      maxPixels: 1e13,

      tileScale: 4

    });

    var validArea = ee.Number(
      validResult.get('area')
    );

    var bareArea = ee.Number(
      bareResult.get('area')
    );

    return ee.Feature(null, {

      year: year,

      valid_area_ha: validArea,

      bare_area_ha: bareArea,

      bare_percentage: bareArea
        .divide(validArea)
        .multiply(100)

    });

  })
);

print(
  'TEMPORAL CLASSIFICATION VALIDATION:',
  temporalCheck
);


// ==========================================
// STAGE 16B: VISUAL TEMPORAL COMPARISON
// ==========================================

var yearsToCheck = [2018, 2022, 2025];

var rgbVisualization = {
  bands: ['B4', 'B3', 'B2'],
  min: 0.02,
  max: 0.30,
  gamma: 1.2
};

var classificationVisualization = {
  min: 0,
  max: 4,
  palette: [
    '006400',
    'FFFF00',
    'FF0000',
    '808080',
    '0000FF'
  ]
};

yearsToCheck.forEach(function(year) {

  var rgb = getS2Composite(year);

  var classified = ee.Image(
    annualClassification
      .filter(ee.Filter.eq('year', year))
      .first()
  );

  Map.addLayer(
    rgb,
    rgbVisualization,
    'RGB ' + year,
    false
  );

  Map.addLayer(
    classified,
    classificationVisualization,
    'Classification ' + year,
    false
  );

  Map.addLayer(
    classified.eq(2).selfMask(),
    {palette: ['FF0000']},
    'Bare Surface ' + year,
    false
  );

});

Map.centerObject(roi, 10);


// ==========================================
// UPDATE CLASS INTERPRETATION
// ==========================================

var updatedClassNames = ee.List([
  'Vegetation',
  'Agriculture',
  'Bare / Open Land',
  'Built-up',
  'Water'
]);

// Update annual statistics labels

var updatedAnnualStatistics =
  annualAreaStatistics.map(function(feature) {

    var classID = ee.Number(
      feature.get('class_id')
    );

    return feature.set(
      'class_name',
      updatedClassNames.get(classID)
    );

  });

print(
  'UPDATED ANNUAL LAND COVER STATISTICS:',
  updatedAnnualStatistics
);

// Extract bare/open land statistics

var bareOpenStatistics =
  updatedAnnualStatistics.filter(
    ee.Filter.eq('class_id', 2)
  );

print(
  'ANNUAL BARE / OPEN LAND AREA:',
  bareOpenStatistics
);

// Updated chart

var updatedChart = ui.Chart.feature.byFeature(
  bareOpenStatistics,
  'year',
  ['area_ha']
)
.setChartType('LineChart')
.setOptions({

  title: 'Annual Bare / Open Land Area (2018-2025)',

  hAxis: {
    title: 'Year',
    format: '####'
  },

  vAxis: {
    title: 'Area (Hectares)'
  },

  pointSize: 6,
  lineWidth: 3,

  legend: {
    position: 'none'
  }

});

print(updatedChart);


// ==========================================
// UPDATED STAGE 17: SAF QUARRY REFERENCE AREA
// PT SINAR ASIA FORTUNA - REMBANG
// ==========================================

// REPLACE OLD YELLOW RECTANGLE

var safReferenceAOI = ee.Geometry.Rectangle(
  [
    111.515278,  // West
    -6.883333,   // South
    111.533333,  // East
    -6.863889    // North
  ],
  null,
  false
);

// FEATURE COLLECTION

var safReferenceFeature = ee.FeatureCollection([
  ee.Feature(safReferenceAOI, {
    site_id: 'SAF-001',
    company: 'PT Sinar Asia Fortuna',
    commodity: 'Limestone',
    location: 'Tahunan, Sale, Rembang',
    boundary_type: 'Reference Study Area'
  })
]);

// DISPLAY UPDATED YELLOW BOUNDARY

Map.addLayer(
  safReferenceFeature.style({
    color: 'FFFF00',
    fillColor: 'FFFF0010',
    width: 3
  }),
  {},
  'UPDATED SAF Reference Area'
);

// CALCULATE AREA

print(
  'UPDATED SAF Reference Area (ha):',
  safReferenceAOI.area(1).divide(10000)
);

// ZOOM MAP

Map.centerObject(safReferenceAOI, 14);




// ==========================================
// STAGE 18: SAF SATELLITE IMAGE COMPARISON
// ==========================================

// 1. SENTINEL-2 COMPOSITE

var safImage2018 = getS2Composite(2018);

var safImage2025 = getS2Composite(2025);

// 2. RGB VISUALIZATION

var safRGB = {
  bands: ['B4', 'B3', 'B2'],
  min: 0.02,
  max: 0.30,
  gamma: 1.2
};

// 3. DISPLAY 2018

Map.addLayer(
  safImage2018,
  safRGB,
  'SAF RGB 2018',
  false
);

// 4. DISPLAY 2025

Map.addLayer(
  safImage2025,
  safRGB,
  'SAF RGB 2025',
  true
);

// 5. SHOW REFERENCE BOUNDARY

Map.addLayer(
  safReferenceFeature.style({
    color: 'FFFF00',
    fillColor: '00000000',
    width: 3
  }),
  {},
  'SAF Reference Boundary'
);

Map.centerObject(safReferenceAOI, 15);


// ==========================================
// STAGE 19: SAF LOCAL LAND COVER ANALYSIS
// ==========================================

// 1. GET ANNUAL CLASSIFICATION

var safClass2018 = ee.Image(
  annualClassification
    .filter(ee.Filter.eq('year', 2018))
    .first()
);

var safClass2025 = ee.Image(
  annualClassification
    .filter(ee.Filter.eq('year', 2025))
    .first()
);

// 2. CLASS NAMES

var safClassNames = ee.List([
  'Vegetation',
  'Agriculture',
  'Bare / Open Land',
  'Built-up',
  'Water'
]);

// 3. FUNCTION TO CALCULATE LOCAL AREA

function calculateSAFArea(image, year) {

  var areaImage = ee.Image.pixelArea()
    .divide(10000)
    .rename('area_ha')
    .addBands(image.rename('class'));

  var result = areaImage.reduceRegion({

    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'class'
    }),

    geometry: safReferenceAOI,

    scale: 20,

    maxPixels: 1e13,

    tileScale: 4

  });

  var groups = ee.List(
    ee.Dictionary(result).get('groups', [])
  );

  return ee.FeatureCollection(
    groups.map(function(item) {

      var dictionary = ee.Dictionary(item);

      var classID = ee.Number(
        dictionary.get('class')
      );

      return ee.Feature(null, {

        year: year,

        class_id: classID,

        class_name: safClassNames.get(classID),

        area_ha: dictionary.get('sum')

      });

    })
  );
}

// 4. CALCULATE 2018 AND 2025

var safArea2018 = calculateSAFArea(
  safClass2018, 2018
);

var safArea2025 = calculateSAFArea(
  safClass2025, 2025
);

// 5. MERGE STATISTICS

var safAnnualStatistics = safArea2018.merge(
  safArea2025
);

print(
  'SAF LAND COVER STATISTICS:',
  safAnnualStatistics
);

// 6. CREATE AREA CHART

var safChart = ui.Chart.feature.groups({

  features: safAnnualStatistics,

  xProperty: 'class_name',

  yProperty: 'area_ha',

  seriesProperty: 'year'

})
.setChartType('ColumnChart')
.setOptions({

  title: 'SAF Quarry Area - Land Cover Comparison',

  hAxis: {
    title: 'Land Cover'
  },

  vAxis: {
    title: 'Area (Hectares)'
  },

  series: {
    0: {color: '4CAF50'},
    1: {color: 'E67E22'}
  },

  legend: {
    position: 'bottom'
  }

});

print(safChart);

// 7. EXPORT RESULTS

Export.table.toDrive({

  collection: safAnnualStatistics,

  description: 'SAF_LandCover_2018_2025',

  folder: 'GEE_Mining_Monitoring',

  fileFormat: 'CSV'

});


// ==========================================
// STAGE 20: SAF LAND COVER TRANSITION
// ==========================================

// COMMON VALID PIXELS

var safCommonMask = safClass2018.mask()
  .and(safClass2025.mask());

// VEGETATION TO BARE

var safVegetationToBare = safClass2018.eq(0)
  .and(safClass2025.eq(2))
  .updateMask(safCommonMask)
  .selfMask();

// AGRICULTURE TO BARE

var safAgricultureToBare = safClass2018.eq(1)
  .and(safClass2025.eq(2))
  .updateMask(safCommonMask)
  .selfMask();

// BARE TO NON-BARE

var safBareToNonBare = safClass2018.eq(2)
  .and(safClass2025.neq(2))
  .updateMask(safCommonMask)
  .selfMask();

// DISPLAY TRANSITIONS

Map.addLayer(
  safVegetationToBare,
  {palette: ['FF00FF']},
  'SAF Vegetation to Bare 2018-2025'
);

Map.addLayer(
  safAgricultureToBare,
  {palette: ['FF8C00']},
  'SAF Agriculture to Bare 2018-2025'
);

Map.addLayer(
  safBareToNonBare,
  {palette: ['00FFFF']},
  'SAF Bare to Non-Bare 2018-2025'
);

// AREA CALCULATION

function getTransitionArea(mask, name) {

  var result = ee.Image.pixelArea()
    .divide(10000)
    .rename('area_ha')
    .updateMask(mask)
    .reduceRegion({

      reducer: ee.Reducer.sum(),

      geometry: safReferenceAOI,

      scale: 20,

      maxPixels: 1e13,

      tileScale: 4

    });

  return ee.Feature(null, {
    transition: name,
    area_ha: result.get('area_ha')
  });
}

var safTransitionStatistics = ee.FeatureCollection([

  getTransitionArea(
    safVegetationToBare,
    'Vegetation to Bare'
  ),

  getTransitionArea(
    safAgricultureToBare,
    'Agriculture to Bare'
  ),

  getTransitionArea(
    safBareToNonBare,
    'Bare to Non-Bare'
  )

]);

print(
  'SAF TRANSITION STATISTICS:',
  safTransitionStatistics
);



// ==========================================
// STAGE 21: SAF SHAPEFILE AS STUDY AREA
// ==========================================

// GANTI "table" dengan nama variabel SHP di Imports

// Use existing SAF reference feature
var safShpFC = safReferenceFeature;

// Define SAF analysis geometry
var safAOI = safShpFC.geometry();

// Calculate area
var safAOIArea = safAOI.area(1).divide(10000);

print('SAF SHP AREA (ha):', safAOIArea);
print('SAF SHP FEATURES:', safShpFC.size());

// Display boundary
Map.addLayer(
  safShpFC.style({
    color: 'FFFF00',
    fillColor: 'FFFF0010',
    width: 3
  }),
  {},
  'SAF Actual Imported Boundary'
);

Map.centerObject(safShpFC, 14);


// ==========================================
// STAGE 22: SAF LAND COVER COMPARISON
// ==========================================

var saf2018 = ee.Image(
  annualClassification
    .filter(ee.Filter.eq('year', 2018))
    .first()
);

var saf2025 = ee.Image(
  annualClassification
    .filter(ee.Filter.eq('year', 2025))
    .first()
);

// Class names
var safNames = ee.List([
  'Vegetation',
  'Agriculture',
  'Bare / Open Land',
  'Built-up',
  'Water'
]);

// Area calculation function
function getSAFArea(image, year) {

  var areaImage = ee.Image.pixelArea()
    .divide(10000)
    .rename('area_ha')
    .addBands(image.rename('class'));

  var result = areaImage.reduceRegion({

    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'class'
    }),

    geometry: safAOI,

    scale: 20,

    maxPixels: 1e13,

    tileScale: 4

  });

  var groups = ee.List(
    ee.Dictionary(result).get('groups', [])
  );

  return ee.FeatureCollection(
    groups.map(function(item) {

      var d = ee.Dictionary(item);

      var id = ee.Number(d.get('class'));

      return ee.Feature(null, {

        year: year,

        class_id: id,

        class_name: safNames.get(id),

        area_ha: d.get('sum')

      });

    })
  );
}

// Calculate 2018 and 2025
var safStats2018 = getSAFArea(saf2018, 2018);
var safStats2025 = getSAFArea(saf2025, 2025);

var safFinalStats = safStats2018.merge(
  safStats2025
);

print(
  'SAF UPDATED LAND COVER STATISTICS:',
  safFinalStats
);

// Comparison chart
var safComparisonChart = ui.Chart.feature.groups({

  features: safFinalStats,

  xProperty: 'class_name',

  yProperty: 'area_ha',

  seriesProperty: 'year'

})
.setChartType('ColumnChart')
.setOptions({

  title: 'SAF Land Cover Comparison 2018-2025',

  hAxis: {
    title: 'Land Cover Class'
  },

  vAxis: {
    title: 'Area (ha)'
  },

  legend: {
    position: 'bottom'
  }

});

print(safComparisonChart);


// ==========================================
// STAGE 23: SAF LAND COVER TRANSITION
// ==========================================

// Common valid pixel mask
var safMask = saf2018.mask()
  .and(saf2025.mask());

// Transition classes
var vegToBare = saf2018.eq(0)
  .and(saf2025.eq(2))
  .updateMask(safMask);

var agricultureToBare = saf2018.eq(1)
  .and(saf2025.eq(2))
  .updateMask(safMask);

var bareToOther = saf2018.eq(2)
  .and(saf2025.neq(2))
  .updateMask(safMask);

// Calculate transition area
function calculateTransition(mask, label) {

  var area = ee.Image.pixelArea()
    .divide(10000)
    .rename('area_ha')
    .updateMask(mask)
    .reduceRegion({

      reducer: ee.Reducer.sum(),

      geometry: safAOI,

      scale: 20,

      maxPixels: 1e13,

      tileScale: 4

    });

  return ee.Feature(null, {
    transition: label,
    area_ha: area.get('area_ha')
  });
}

var safTransitions = ee.FeatureCollection([

  calculateTransition(
    vegToBare,
    'Vegetation to Bare'
  ),

  calculateTransition(
    agricultureToBare,
    'Agriculture to Bare'
  ),

  calculateTransition(
    bareToOther,
    'Bare to Other'
  )

]);

print('SAF TRANSITION RESULTS:', safTransitions);

// Display transition map
Map.addLayer(
  vegToBare.selfMask(),
  {palette: ['FF00FF']},
  'Vegetation to Bare'
);

Map.addLayer(
  agricultureToBare.selfMask(),
  {palette: ['FF8800']},
  'Agriculture to Bare'
);

Map.addLayer(
  bareToOther.selfMask(),
  {palette: ['00FFFF']},
  'Bare to Other'
);

var safAOIArea = safAOI.area(1).divide(10000);

print('SAF SHP AREA (ha):', safAOIArea);
print('SAF SHP FEATURES:', safShpFC.size());

Map.addLayer(
  safShpFC.style({
    color: 'FFFF00',
    fillColor: 'FFFF0010',
    width: 3
  }),
  {},
  'SAF Actual Imported Boundary'
);

Map.centerObject(safShpFC, 14);


// ==========================================
// STAGE 24: FULL LAND COVER TRANSITION MATRIX
// SAF REFERENCE AREA 2018-2025
// ==========================================

// CLASS NAMES
var transitionNames = ee.List([
  'Vegetation',
  'Agriculture',
  'Bare / Open Land',
  'Built-up',
  'Water'
]);

// COMMON VALID PIXELS
var commonMask = saf2018.mask()
  .and(saf2025.mask());

// ENCODE TRANSITION
// Example: 12 means Agriculture -> Bare

var transitionCode = saf2018
  .multiply(10)
  .add(saf2025)
  .rename('transition')
  .updateMask(commonMask);

// PIXEL AREA
var transitionAreaImage = ee.Image.pixelArea()
  .divide(10000)
  .rename('area_ha')
  .addBands(transitionCode);

// REDUCE REGION
var transitionResult = transitionAreaImage.reduceRegion({

  reducer: ee.Reducer.sum().group({
    groupField: 1,
    groupName: 'transition'
  }),

  geometry: safAOI,

  scale: 20,

  maxPixels: 1e13,

  tileScale: 4

});

// CONVERT TO FEATURE COLLECTION
var transitionGroups = ee.List(
  ee.Dictionary(transitionResult).get('groups', [])
);

var transitionMatrix = ee.FeatureCollection(
  transitionGroups.map(function(item) {

    var d = ee.Dictionary(item);

    var code = ee.Number(d.get('transition'));

    var fromClass = code.divide(10).floor();

    var toClass = code.mod(10);

    return ee.Feature(null, {

      from_class: fromClass,

      to_class: toClass,

      from_name: transitionNames.get(fromClass),

      to_name: transitionNames.get(toClass),

transition: ee.String(
  transitionNames.get(fromClass)
).cat(' to ').cat(
  ee.String(transitionNames.get(toClass))
),

      area_ha: d.get('sum')

    });

  })
);

// PRINT RESULTS
print(
  'FULL LAND COVER TRANSITION MATRIX:',
  transitionMatrix
);

// CHECK COMMON VALID AREA
print(
  'COMMON VALID AREA (ha):',
  ee.Image.pixelArea()
    .divide(10000)
    .updateMask(commonMask)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: safAOI,
      scale: 20,
      maxPixels: 1e13,
      tileScale: 4
    })
);

// EXPORT CSV
Export.table.toDrive({

  collection: transitionMatrix,

  description: 'SAF_Full_Transition_Matrix_2018_2025',

  folder: 'GEE_Mining_Monitoring',

  fileFormat: 'CSV'

});


// ==========================================
// STAGE 25: TRANSITION MATRIX CONSISTENCY
// ==========================================

// 1. COMMON VALID MASK

var commonMaskCheck = saf2018.mask()
  .and(saf2025.mask());

// 2. APPLY THE SAME MASK TO BOTH YEARS

var common2018 = saf2018.updateMask(
  commonMaskCheck
);

var common2025 = saf2025.updateMask(
  commonMaskCheck
);

// 3. AREA CALCULATION FUNCTION

function commonClassArea(image, year) {

  var areaImage = ee.Image.pixelArea()
    .divide(10000)
    .rename('area_ha')
    .addBands(image.rename('class'));

  var result = areaImage.reduceRegion({

    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'class'
    }),

    geometry: safAOI,

    scale: 20,

    maxPixels: 1e13,

    tileScale: 4

  });

  var groups = ee.List(
    ee.Dictionary(result).get('groups', [])
  );

  var names = ee.List([
    'Vegetation',
    'Agriculture',
    'Bare / Open Land',
    'Built-up',
    'Water'
  ]);

  return ee.FeatureCollection(
    groups.map(function(item) {

      var d = ee.Dictionary(item);

      var classID = ee.Number(d.get('class'));

      return ee.Feature(null, {

        year: year,

        class_id: classID,

        class_name: names.get(classID),

        area_ha: d.get('sum')

      });

    })
  );
}

// 4. RECALCULATE BOTH YEARS

var commonStats2018 = commonClassArea(
  common2018, 2018
);

var commonStats2025 = commonClassArea(
  common2025, 2025
);

// 5. MERGE TABLES

var commonStatistics = commonStats2018.merge(
  commonStats2025
);

print(
  'COMMON MASK CLASS STATISTICS:',
  commonStatistics
);

// 6. CALCULATE COMMON VALID AREA

var commonArea = ee.Image.pixelArea()
  .divide(10000)
  .updateMask(commonMaskCheck)
  .reduceRegion({

    reducer: ee.Reducer.sum(),

    geometry: safAOI,

    scale: 20,

    maxPixels: 1e13,

    tileScale: 4

  });

print(
  'COMMON VALID AREA:',
  commonArea
);


// ==========================================
// STAGE 26: SAF SPATIAL CHANGE MAP
// ==========================================

// 1. COMMON VALID PIXELS

var safCommonMask = saf2018.mask()
  .and(saf2025.mask());

// 2. PERSISTENT BARE LAND

var persistentBare = saf2018.eq(2)
  .and(saf2025.eq(2))
  .updateMask(safCommonMask)
  .selfMask();

// 3. NEW BARE LAND

var newBare = saf2018.neq(2)
  .and(saf2025.eq(2))
  .updateMask(safCommonMask)
  .selfMask();

// 4. BARE TO NON-BARE

var bareToNonBare = saf2018.eq(2)
  .and(saf2025.neq(2))
  .updateMask(safCommonMask)
  .selfMask();

// 5. RGB COMPOSITES

var safRGB2018 = getS2Composite(2018);

var safRGB2025 = getS2Composite(2025);

var rgbVis = {
  bands: ['B4', 'B3', 'B2'],
  min: 0.02,
  max: 0.30,
  gamma: 1.2
};

// 6. DISPLAY RGB

Map.addLayer(
  safRGB2018,
  rgbVis,
  'SAF RGB 2018',
  false
);

Map.addLayer(
  safRGB2025,
  rgbVis,
  'SAF RGB 2025',
  false
);

// 7. DISPLAY TRANSITIONS

Map.addLayer(
  persistentBare,
  {palette: ['B91C1C']},
  'Persistent Bare Land'
);

Map.addLayer(
  newBare,
  {palette: ['F59E0B']},
  'New Bare Land 2018-2025'
);

Map.addLayer(
  bareToNonBare,
  {palette: ['06B6D4']},
  'Bare to Non-Bare 2018-2025'
);

// 8. DISPLAY STUDY AREA BOUNDARY

Map.addLayer(
  safShpFC.style({
    color: 'FFFFFF',
    fillColor: '00000000',
    width: 2
  }),
  {},
  'SAF Study Boundary'
);

Map.centerObject(safShpFC, 14);

// 9. EXPORT PERSISTENT AND NEW BARE MAP

var changeMap = ee.Image(0)
  .where(persistentBare, 1)
  .where(newBare, 2)
  .where(bareToNonBare, 3)
  .rename('transition')
  .toByte()
  .updateMask(safCommonMask)
  .clip(safAOI);

Export.image.toDrive({

  image: changeMap,

  description: 'SAF_Change_Map_2018_2025',

  folder: 'GEE_Mining_Monitoring',

  fileNamePrefix: 'SAF_Transition_Map_2018_2025',

  region: safAOI,

  scale: 20,

  crs: 'EPSG:32749',

  maxPixels: 1e13

});

// ==========================================
// STAGE 26B: CHANGE AREA STATISTICS
// ==========================================

// Calculate area in hectares
function calculateChangeArea(mask, label) {

  var result = ee.Image.pixelArea()
    .divide(10000)
    .rename('area_ha')
    .updateMask(mask)
    .reduceRegion({

      reducer: ee.Reducer.sum(),

      geometry: safAOI,

      scale: 20,

      maxPixels: 1e13,

      tileScale: 4

    });

  return ee.Feature(null, {
    change_type: label,
    area_ha: result.get('area_ha')
  });
}

// Calculate all change categories

var changeStatistics = ee.FeatureCollection([

  calculateChangeArea(
    persistentBare,
    'Persistent Bare Land'
  ),

  calculateChangeArea(
    newBare,
    'New Bare Land'
  ),

  calculateChangeArea(
    bareToNonBare,
    'Bare to Non-Bare'
  )

]);

// Print results

print(
  'SAF CHANGE AREA STATISTICS:',
  changeStatistics
);

// Export CSV

Export.table.toDrive({

  collection: changeStatistics,

  description: 'SAF_Change_Area_Statistics_2018_2025',

  folder: 'GEE_Mining_Monitoring',

  fileFormat: 'CSV'

});


// ==========================================
// STAGE 27: DYNAMIC WORLD CROSS-CHECK
// ==========================================

// Dynamic World seasonal collection

function getSAFDynamicWorld(year) {

  var start = ee.Date.fromYMD(year, 6, 1);

  var end = ee.Date.fromYMD(year, 10, 1);

  var collection = dw
    .filterBounds(safAOI)
    .filterDate(start, end);

  return collection
    .select('label')
    .mode()
    .rename('dw_class')
    .clip(safAOI);
}

// Get 2018 and 2025

var dwSAF2018 = getSAFDynamicWorld(2018);

var dwSAF2025 = getSAFDynamicWorld(2025);

// Display Dynamic World

var dwPalette = [
  '419BDF', // Water
  '397D49', // Trees
  '88B053', // Grass
  '7A87C6', // Flooded vegetation
  'E49635', // Crops
  'DFC35A', // Shrub and scrub
  'C4281B', // Built
  'A59B8F', // Bare
  'B39FE1'  // Snow
];

Map.addLayer(
  dwSAF2018,
  {
    min: 0,
    max: 8,
    palette: dwPalette
  },
  'Dynamic World 2018',
  false
);

Map.addLayer(
  dwSAF2025,
  {
    min: 0,
    max: 8,
    palette: dwPalette
  },
  'Dynamic World 2025',
  false
);

// Compare Dynamic World bare class

var dwBare2018 = dwSAF2018.eq(7);

var dwBare2025 = dwSAF2025.eq(7);

// RF bare class

var rfBare2018 = saf2018.eq(2);

var rfBare2025 = saf2025.eq(2);

// Overlap between RF and Dynamic World

var rfDwAgreement2025 = rfBare2025
  .and(dwBare2025)
  .updateMask(safCommonMask);

var agreementArea = ee.Image.pixelArea()
  .divide(10000)
  .updateMask(rfDwAgreement2025)
  .reduceRegion({

    reducer: ee.Reducer.sum(),

    geometry: safAOI,

    scale: 20,

    maxPixels: 1e13,

    tileScale: 4

  });

print(
  'RF AND DYNAMIC WORLD BARE OVERLAP 2025 (ha):',
  agreementArea
);

// Display agreement pixels

Map.addLayer(
  rfDwAgreement2025.selfMask(),
  {palette: ['FF00FF']},
  'RF and Dynamic World Bare Agreement 2025'
);


// ==========================================
// STAGE 27B: RF AND DYNAMIC WORLD AGREEMENT
// ==========================================

// 1. COMMON VALID MASK

var crossCheckMask = saf2018.mask()
  .and(saf2025.mask())
  .and(dwSAF2025.mask());

// 2. BARE CLASSIFICATION

var rfBare = saf2025.eq(2)
  .updateMask(crossCheckMask);

var dwBare = dwSAF2025.eq(7)
  .updateMask(crossCheckMask);

// 3. OVERLAPPING BARE PIXELS

var bareOverlap = rfBare.and(dwBare);

// 4. FUNCTION TO CALCULATE AREA

function getArea(mask) {

  var result = ee.Image.pixelArea()
    .divide(10000)
    .rename('area_ha')
    .updateMask(mask)
    .reduceRegion({

      reducer: ee.Reducer.sum(),

      geometry: safAOI,

      scale: 20,

      maxPixels: 1e13,

      tileScale: 4

    });

  return ee.Number(
    result.get('area_ha', 0)
  );
}

// 5. CALCULATE AREA

var rfBareArea = getArea(rfBare);

var dwBareArea = getArea(dwBare);

var overlapArea = getArea(bareOverlap);

// 6. AGREEMENT PERCENTAGES

var rfAgreement = overlapArea
  .divide(rfBareArea)
  .multiply(100);

var dwAgreement = overlapArea
  .divide(dwBareArea)
  .multiply(100);

// 7. PRINT RESULTS

print('RF Bare Area (ha):', rfBareArea);

print('Dynamic World Bare Area (ha):', dwBareArea);

print('Overlap Area (ha):', overlapArea);

print('RF Bare Agreement (%):', rfAgreement);

print('Dynamic World Bare Agreement (%):', dwAgreement);

// 8. DISPLAY OVERLAP

Map.addLayer(
  bareOverlap.selfMask(),
  {palette: ['FF00FF']},
  'RF-DW Bare Agreement 2025'
);


// ==========================================
// STAGE 28: AUTOMATIC CANDIDATE POLYGON
// RF + DYNAMIC WORLD AGREEMENT
// ==========================================

// 1. DEFINE COMMON VALID MASK

var candidateValidMask = saf2025.mask()
  .and(dwSAF2025.mask());

// 2. IDENTIFY BARE LAND AGREEMENT

var candidateBare = saf2025.eq(2)
  .and(dwSAF2025.eq(7))
  .updateMask(candidateValidMask)
  .selfMask()
  .rename('candidate')
  .toByte();

// 3. FILTER SMALL ISOLATED PIXELS

var connectedPixels = candidateBare
  .connectedPixelCount(100, true);

var filteredCandidate = candidateBare
  .updateMask(connectedPixels.gte(5));

// 4. CONVERT RASTER TO POLYGON

var candidatePolygons = filteredCandidate
  .reduceToVectors({

    geometry: safAOI,

    scale: 20,

    geometryType: 'polygon',

    eightConnected: true,

    labelProperty: 'candidate',

    reducer: ee.Reducer.countEvery(),

    maxPixels: 1e13,

    tileScale: 4

  });

// 5. CALCULATE POLYGON AREA

var candidateWithArea = candidatePolygons.map(
  function(feature) {

    var area = feature.geometry()
      .area(1)
      .divide(10000);

    return feature.set({
      area_ha: area,
      site_id: 'SAF-001',
      category: 'Bare/Open Land Candidate'
    });

  }
);

// 6. FILTER MINIMUM PATCH AREA
// 0.2 ha = approximately 5 pixels at 20 m

var finalCandidates = candidateWithArea.filter(
  ee.Filter.gte('area_ha', 0.2)
);

// 7. SORT BY AREA

var rankedCandidates = finalCandidates.sort(
  'area_ha',
  false
);

// 8. PRINT RESULTS

print(
  'TOTAL CANDIDATE POLYGONS:',
  rankedCandidates.size()
);

print(
  'TOP 20 BARE LAND CANDIDATES:',
  rankedCandidates.limit(20)
);

print(
  'TOTAL CANDIDATE AREA (ha):',
  rankedCandidates.aggregate_sum('area_ha')
);

// 9. DISPLAY MAP

Map.addLayer(
  rankedCandidates.style({
    color: 'FF4500',
    fillColor: 'FF450055',
    width: 2
  }),
  {},
  'Automatic Bare Land Candidate Polygons'
);

// 10. EXPORT POLYGON

Export.table.toDrive({

  collection: rankedCandidates,

  description: 'SAF_Automatic_Bare_Land_Candidates_2025',

  folder: 'GEE_Mining_Monitoring',

  fileNamePrefix: 'SAF_Bare_Land_Candidates_2025',

  fileFormat: 'SHP'

});


// ==========================================
// STAGE 29: CANDIDATE RANKING AND COORDINATES
// ==========================================

// 1. CONVERT SORTED CANDIDATES TO LIST

var candidateList = rankedCandidates.toList(
  rankedCandidates.size()
);

// 2. CREATE RANKED FEATURE COLLECTION

var candidateDetails = ee.FeatureCollection(
  ee.List.sequence(
    0,
    rankedCandidates.size().subtract(1)
  ).map(function(index) {

    var feature = ee.Feature(
      candidateList.get(index)
    );

    // Calculate centroid
    var centroid = feature.geometry()
      .centroid(1);

    var coordinates = centroid.coordinates();

    return feature.set({

      candidate_id: ee.Number(index).add(1),

      ranking: ee.Number(index).add(1),

      longitude: coordinates.get(0),

      latitude: coordinates.get(1),

      area_km2: ee.Number(
        feature.get('area_ha')
      ).divide(100)

    });

  })
);

// 3. PRINT CANDIDATE DETAILS

print(
  'RANKED CANDIDATE DETAILS:',
  candidateDetails
);

// 4. PRINT TOP 5 CANDIDATES

print(
  'TOP 5 CANDIDATE LOCATIONS:',
  candidateDetails.limit(5)
);

// 5. CREATE AREA CHART

var candidateChart = ui.Chart.feature.byFeature(
  candidateDetails,
  'candidate_id',
  ['area_ha']
)
.setChartType('ColumnChart')
.setOptions({

  title: 'Bare Land Candidate Ranking 2025',

  hAxis: {
    title: 'Candidate ID',
    format: '0'
  },

  vAxis: {
    title: 'Area (ha)'
  },

  legend: {
    position: 'none'
  },

  pointSize: 5

});

print(candidateChart);

// 6. DISPLAY CENTROID POINTS

var candidateCentroids = candidateDetails.map(
  function(feature) {

    return ee.Feature(
      feature.geometry().centroid(1)
    ).copyProperties(feature);

  }
);

Map.addLayer(
  candidateCentroids,
  {
    color: '00FFFF',
    pointSize: 6
  },
  'Candidate Centroid Locations'
);

// 7. EXPORT CSV

Export.table.toDrive({

  collection: candidateDetails.select([
    'candidate_id',
    'ranking',
    'area_ha',
    'area_km2',
    'longitude',
    'latitude',
    'site_id',
    'category'
  ]),

  description: 'SAF_Candidate_Ranking_2025',

  folder: 'GEE_Mining_Monitoring',

  fileFormat: 'CSV'

});

// 8. EXPORT SHAPEFILE

Export.table.toDrive({

  collection: candidateDetails,

  description: 'SAF_Ranked_Candidate_Polygons_2025',

  folder: 'GEE_Mining_Monitoring',

  fileFormat: 'SHP'

});


// ==========================================
// STAGE 30: CANDIDATE PRIORITY CLASSIFICATION
// ==========================================

var prioritizedCandidates = candidateDetails.map(
  function(feature) {

    var area = ee.Number(
      feature.get('area_ha')
    );

    var priority = ee.String(
      ee.Algorithms.If(
        area.gte(5),
        'High',
        ee.Algorithms.If(
          area.gte(1),
          'Medium',
          'Low'
        )
      )
    );

    return feature.set({
      priority: priority
    });

  }
);

// PRINT RESULTS

print(
  'PRIORITIZED CANDIDATES:',
  prioritizedCandidates
);

print(
  'PRIORITY DISTRIBUTION:',
  prioritizedCandidates.aggregate_histogram('priority')
);

// DISPLAY BY PRIORITY

var highPriority = prioritizedCandidates.filter(
  ee.Filter.eq('priority', 'High')
);

var mediumPriority = prioritizedCandidates.filter(
  ee.Filter.eq('priority', 'Medium')
);

var lowPriority = prioritizedCandidates.filter(
  ee.Filter.eq('priority', 'Low')
);

Map.addLayer(
  highPriority.style({
    color: 'FF0000',
    fillColor: 'FF000055',
    width: 2
  }),
  {},
  'High Priority Candidates'
);

Map.addLayer(
  mediumPriority.style({
    color: 'FFA500',
    fillColor: 'FFA50055',
    width: 2
  }),
  {},
  'Medium Priority Candidates'
);

Map.addLayer(
  lowPriority.style({
    color: 'FFFF00',
    fillColor: 'FFFF0055',
    width: 2
  }),
  {},
  'Low Priority Candidates'
);


// ==========================================
// STAGE 31: TEMPORAL MONITORING OF CANDIDATES
// YEARS: 2018, 2022, 2025
// ==========================================

// 1. DEFINE MONITORING YEARS

var candidateTemporalYears = ee.List([
  2018, 2022, 2025
]);

// 2. DYNAMIC WORLD SEASONAL COMPOSITE

function getCandidateDWLabel(year) {

  var start = ee.Date.fromYMD(year, 6, 1);
  var end = ee.Date.fromYMD(year, 10, 1);

  var collection = dw
    .filterBounds(safAOI)
    .filterDate(start, end)
    .select('label');

  return collection
    .mode()
    .rename('dw_class')
    .clip(safAOI);
}

// 3. CALCULATE TEMPORAL STATISTICS

var candidateTemporalStats = ee.FeatureCollection(

  candidateTemporalYears.map(function(year) {

    year = ee.Number(year);

    // Random Forest classification
    var rfImage = ee.Image(
      annualClassification
        .filter(ee.Filter.eq('year', year))
        .first()
    );

    // Dynamic World classification
    var dwImage = getCandidateDWLabel(year);

    // Sentinel-2 NDVI
    var ndviImage = getS2Composite(year)
      .normalizedDifference(['B8', 'B4'])
      .rename('NDVI');

    // Area bands
    var areaBands = ee.Image.cat([

      ee.Image.pixelArea()
        .divide(10000)
        .rename('rf_valid_ha')
        .updateMask(rfImage.mask()),

      ee.Image.pixelArea()
        .divide(10000)
        .rename('rf_bare_ha')
        .updateMask(rfImage.eq(2)),

      ee.Image.pixelArea()
        .divide(10000)
        .rename('dw_valid_ha')
        .updateMask(dwImage.mask()),

      ee.Image.pixelArea()
        .divide(10000)
        .rename('dw_bare_ha')
        .updateMask(dwImage.eq(7))

    ]);

    // Calculate each candidate polygon

    return candidateDetails.map(function(feature) {

      var geometry = feature.geometry();

      // Area statistics
      var areaResult = ee.Dictionary(
        areaBands.reduceRegion({

          reducer: ee.Reducer.sum(),

          geometry: geometry,

          scale: 20,

          maxPixels: 1e13,

          tileScale: 4

        })
      );

      // NDVI mean
      var ndviResult = ee.Dictionary(
        ndviImage.reduceRegion({

          reducer: ee.Reducer.mean(),

          geometry: geometry,

          scale: 20,

          maxPixels: 1e13,

          tileScale: 4

        })
      );

      // Extract values
      var rfValid = ee.Number(
        areaResult.get('rf_valid_ha', 0)
      );

      var rfBare = ee.Number(
        areaResult.get('rf_bare_ha', 0)
      );

      var dwValid = ee.Number(
        areaResult.get('dw_valid_ha', 0)
      );

      var dwBare = ee.Number(
        areaResult.get('dw_bare_ha', 0)
      );

      var ndviMean = ee.Number(
        ndviResult.get('NDVI', -9999)
      );

      // Calculate percentages
      var rfBarePercent = ee.Number(
        ee.Algorithms.If(
          rfValid.gt(0),
          rfBare.divide(rfValid).multiply(100),
          -9999
        )
      );

      var dwBarePercent = ee.Number(
        ee.Algorithms.If(
          dwValid.gt(0),
          dwBare.divide(dwValid).multiply(100),
          -9999
        )
      );

      return feature.set({

        year: year,

        rf_valid_ha: rfValid,

        rf_bare_ha: rfBare,

        rf_bare_percent: rfBarePercent,

        dw_valid_ha: dwValid,

        dw_bare_ha: dwBare,

        dw_bare_percent: dwBarePercent,

        ndvi_mean: ndviMean

      });

    });

  })

).flatten();

// 4. PRINT RESULTS

print(
  'CANDIDATE TEMPORAL STATISTICS:',
  candidateTemporalStats
);

// 5. CHECK TOP 5 CANDIDATES

var top5Temporal = candidateTemporalStats.filter(
  ee.Filter.lte('ranking', 5)
);

print(
  'TOP 5 TEMPORAL MONITORING:',
  top5Temporal
);

// 6. CHECK CANDIDATE 1

print(
  'LARGEST CANDIDATE TEMPORAL HISTORY:',
  candidateTemporalStats.filter(
    ee.Filter.eq('candidate_id', 1)
  )
);

// 7. EXPORT TEMPORAL STATISTICS

Export.table.toDrive({

  collection: candidateTemporalStats.select([

    'candidate_id',
    'ranking',
    'year',
    'area_ha',
    'rf_valid_ha',
    'rf_bare_ha',
    'rf_bare_percent',
    'dw_valid_ha',
    'dw_bare_ha',
    'dw_bare_percent',
    'ndvi_mean',
    'priority'

  ]),

  description: 'SAF_Candidate_Temporal_Monitoring_2018_2025',

  folder: 'GEE_Mining_Monitoring',

  fileFormat: 'CSV'

});

// 8. ANNUAL SUMMARY FOR ALL CANDIDATES

var candidateAnnualSummary = ee.FeatureCollection(
  candidateTemporalYears.map(function(year) {

    year = ee.Number(year);

    var subset = candidateTemporalStats.filter(
      ee.Filter.eq('year', year)
    );

    return ee.Feature(null, {

      year: year,

      total_rf_bare_ha:
        subset.aggregate_sum('rf_bare_ha'),

      total_dw_bare_ha:
        subset.aggregate_sum('dw_bare_ha'),

      average_ndvi:
        subset.aggregate_mean('ndvi_mean')

    });

  })
);

print(
  'CANDIDATE ANNUAL SUMMARY:',
  candidateAnnualSummary
);

// 9. CREATE TEMPORAL CHART

var temporalChart = ui.Chart.feature.byFeature(
  candidateAnnualSummary,
  'year',
  ['total_rf_bare_ha', 'total_dw_bare_ha']
)
.setChartType('LineChart')
.setOptions({

  title: 'Candidate Bare Land Temporal Analysis',

  hAxis: {
    title: 'Year',
    format: '####'
  },

  vAxis: {
    title: 'Area (ha)'
  },

  lineWidth: 3,

  pointSize: 7,

  legend: {
    position: 'bottom'
  }

});

print(temporalChart);


// ==========================================
// STAGE 31B: CORRECTED TEMPORAL STATISTICS
// COMMON GRID AND COMMON VALID MASK
// ==========================================

// 1. REFERENCE PROJECTION - SENTINEL-2 B11

var analysisProjection = getS2Composite(2025)
  .select('B11')
  .projection();

// 2. TEMPORAL ANALYSIS

var correctedTemporalStats = ee.FeatureCollection(

  candidateTemporalYears.map(function(year) {

    year = ee.Number(year);

    // RF classification
    var rfImage = ee.Image(
      annualClassification
        .filter(ee.Filter.eq('year', year))
        .first()
    );

    // Dynamic World label
    var dwImage = getCandidateDWLabel(year);

    // NDVI
    var ndviImage = getS2Composite(year)
      .normalizedDifference(['B8', 'B4'])
      .rename('NDVI');

    // Common valid mask
    var commonMask = rfImage.mask()
      .and(dwImage.mask())
      .and(ndviImage.mask());

    // Pixel area in hectares
    var pixelHa = ee.Image.pixelArea()
      .divide(10000);

    // All area bands use the same valid mask
    var areaStack = ee.Image.cat([

      pixelHa.updateMask(commonMask)
        .rename('common_valid_ha'),

      pixelHa.updateMask(
        commonMask.and(rfImage.eq(2))
      ).rename('rf_bare_ha'),

      pixelHa.updateMask(
        commonMask.and(dwImage.eq(7))
      ).rename('dw_bare_ha')

    ]);

    var ndviCommon = ndviImage.updateMask(
      commonMask
    );

    // Calculate for every candidate polygon
    return candidateDetails.map(function(feature) {

      var geometry = feature.geometry();

      // Area reduction on a common 20m grid
      var areaResult = areaStack.reduceRegion({

        reducer: ee.Reducer.sum(),

        geometry: geometry,

        crs: analysisProjection,

        scale: 20,

        maxPixels: 1e13,

        tileScale: 4

      });

      // Mean NDVI on the same grid
      var ndviResult = ndviCommon.reduceRegion({

        reducer: ee.Reducer.mean(),

        geometry: geometry,

        crs: analysisProjection,

        scale: 20,

        maxPixels: 1e13,

        tileScale: 4

      });

      // Extract values
      var validArea = ee.Number(
        areaResult.get('common_valid_ha', 0)
      );

      var rfBareArea = ee.Number(
        areaResult.get('rf_bare_ha', 0)
      );

      var dwBareArea = ee.Number(
        areaResult.get('dw_bare_ha', 0)
      );

      var meanNDVI = ee.Number(
        ndviResult.get('NDVI', -9999)
      );

      // Percentages relative to the same valid area
      var rfPercent = ee.Number(
        ee.Algorithms.If(
          validArea.gt(0),
          rfBareArea.divide(validArea).multiply(100),
          -9999
        )
      );

      var dwPercent = ee.Number(
        ee.Algorithms.If(
          validArea.gt(0),
          dwBareArea.divide(validArea).multiply(100),
          -9999
        )
      );

      return feature.set({

        year: year,

        common_valid_ha: validArea,

        rf_bare_ha_corrected: rfBareArea,

        dw_bare_ha_corrected: dwBareArea,

        rf_bare_percent: rfPercent,

        dw_bare_percent: dwPercent,

        ndvi_mean_corrected: meanNDVI

      });

    });

  })

).flatten();

// 3. PRINT CORRECTED RESULTS

print(
  'CORRECTED TEMPORAL STATISTICS:',
  correctedTemporalStats
);

// 4. LARGEST CANDIDATE

print(
  'CORRECTED CANDIDATE 01:',
  correctedTemporalStats.filter(
    ee.Filter.eq('candidate_id', 1)
  )
);

// 5. EXPORT RESULTS

Export.table.toDrive({

  collection: correctedTemporalStats,

  description: 'SAF_Corrected_Temporal_Statistics',

  folder: 'GEE_Mining_Monitoring',

  fileFormat: 'CSV'

});


// ==========================================
// STAGE 32: CANDIDATE 01 TEMPORAL VISUALIZATION
// ==========================================

// 1. GET CANDIDATE 01 GEOMETRY

var candidate01 = ee.Feature(
  candidateDetails
    .filter(ee.Filter.eq('candidate_id', 1))
    .first()
);

var candidate01AOI = candidate01.geometry();

// 2. RGB VISUALIZATION

var candidateRGB = {
  bands: ['B4', 'B3', 'B2'],
  min: 0.02,
  max: 0.30,
  gamma: 1.2
};

// 3. LOAD RGB COMPOSITES

var rgb2018 = getS2Composite(2018)
  .clip(candidate01AOI);

var rgb2022 = getS2Composite(2022)
  .clip(candidate01AOI);

var rgb2025 = getS2Composite(2025)
  .clip(candidate01AOI);

// 4. DISPLAY RGB LAYERS

Map.addLayer(
  rgb2018,
  candidateRGB,
  'Candidate 01 RGB 2018',
  false
);

Map.addLayer(
  rgb2022,
  candidateRGB,
  'Candidate 01 RGB 2022',
  false
);

Map.addLayer(
  rgb2025,
  candidateRGB,
  'Candidate 01 RGB 2025',
  true
);

// 5. NDVI COMPARISON

var ndvi2018 = rgb2018.normalizedDifference(
  ['B8', 'B4']
).rename('NDVI');

var ndvi2022 = rgb2022.normalizedDifference(
  ['B8', 'B4']
).rename('NDVI');

var ndvi2025 = rgb2025.normalizedDifference(
  ['B8', 'B4']
).rename('NDVI');

var ndviVisualization = {
  min: -0.2,
  max: 0.8,
  palette: [
    '8c510a',
    'd8b365',
    'f6e8c3',
    'a6d96a',
    '1a9850'
  ]
};

Map.addLayer(
  ndvi2018,
  ndviVisualization,
  'Candidate 01 NDVI 2018',
  false
);

Map.addLayer(
  ndvi2022,
  ndviVisualization,
  'Candidate 01 NDVI 2022',
  false
);

Map.addLayer(
  ndvi2025,
  ndviVisualization,
  'Candidate 01 NDVI 2025',
  false
);

// 6. DISPLAY CANDIDATE BOUNDARY

Map.addLayer(
  ee.FeatureCollection([candidate01]).style({
    color: 'FFFF00',
    fillColor: '00000000',
    width: 3
  }),
  {},
  'Candidate 01 Boundary'
);

// 7. CENTER MAP

Map.centerObject(candidate01AOI, 15);

// 8. PRINT CANDIDATE INFORMATION

print('CANDIDATE 01 AREA (ha):',
  candidate01.get('area_ha'));

print('CANDIDATE 01 CENTROID:',
  candidate01.geometry().centroid(1).coordinates());


// ==========================================
// STAGE 33: CANDIDATE 01 TEMPORAL CHARTS
// ==========================================

// Filter Candidate 01
var candidate01Temporal = correctedTemporalStats
  .filter(ee.Filter.eq('candidate_id', 1))
  .sort('year');

// 1. BARE LAND PERCENTAGE CHART

var bareChart = ui.Chart.feature.byFeature({

  features: candidate01Temporal,

  xProperty: 'year',

  yProperties: [
    'rf_bare_percent',
    'dw_bare_percent'
  ]

})
.setChartType('LineChart')
.setOptions({

  title: 'Candidate 01 - Bare Land Percentage',

  hAxis: {
    title: 'Year',
    format: '####'
  },

  vAxis: {
    title: 'Bare Land (%)',
    viewWindow: {
      min: 0,
      max: 100
    }
  },

  lineWidth: 3,
  pointSize: 7,

  legend: {
    position: 'bottom'
  }

});

print(bareChart);

// 2. NDVI CHART

var ndviChart = ui.Chart.feature.byFeature({

  features: candidate01Temporal,

  xProperty: 'year',

  yProperties: [
    'ndvi_mean_corrected'
  ]

})
.setChartType('LineChart')
.setOptions({

  title: 'Candidate 01 - Vegetation Index Trend',

  hAxis: {
    title: 'Year',
    format: '####'
  },

  vAxis: {
    title: 'Mean NDVI'
  },

  lineWidth: 3,
  pointSize: 7,

  legend: {
    position: 'none'
  }

});

print(ndviChart);


// =====================================================
// STAGE 34: FINAL INTERACTIVE MINING MONITORING DASHBOARD
// REMBANG, CENTRAL JAVA | 2018-2025
// =====================================================

// 1. DASHBOARD CONFIGURATION

var dashMap = ui.Map();

var dashPanel = ui.Panel({
  style: {
    width: '370px',
    padding: '12px'
  }
});

// 2. DASHBOARD HEADER

dashPanel.add(ui.Label({
  value: 'MINING AREA MONITORING',
  style: {
    fontSize: '21px',
    fontWeight: 'bold',
    color: '#17365D'
  }
}));

dashPanel.add(ui.Label({
  value: 'REMBANG REGENCY, CENTRAL JAVA',
  style: {
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#666666'
  }
}));

dashPanel.add(ui.Label({
  value: 'Satellite-Based Land Cover Dynamics | 2018-2025',
  style: {
    fontSize: '11px',
    color: '#777777',
    margin: '0 0 12px 0'
  }
}));

// 3. MODEL ACCURACY INFORMATION

var dashAccuracy = ui.Label(
  'Random Forest Accuracy: Loading...',
  {
    fontWeight: 'bold',
    fontSize: '12px'
  }
);

dashPanel.add(dashAccuracy);

rfConfusionMatrix.accuracy().evaluate(
  function(value) {

    if (value !== null) {

      dashAccuracy.setValue(
        'Random Forest Overall Accuracy: ' +
        (value * 100).toFixed(2) + '%'
      );

    }

  }
);

// 4. YEAR SELECTOR

dashPanel.add(ui.Label({
  value: 'Select Monitoring Year',
  style: {
    fontWeight: 'bold',
    margin: '15px 0 5px 0'
  }
}));

var dashYearSelect = ui.Select({

  items: [
    '2018',
    '2019',
    '2020',
    '2021',
    '2022',
    '2023',
    '2024',
    '2025'
  ],

  value: '2025',

  onChange: updateFinalDashboard

});

dashPanel.add(dashYearSelect);

// 5. CANDIDATE SELECTOR

dashPanel.add(ui.Label({
  value: 'Select Bare Land Candidate',
  style: {
    fontWeight: 'bold',
    margin: '12px 0 5px 0'
  }
}));

var candidateOptions = [];

for (var i = 1; i <= 13; i++) {
  candidateOptions.push(String(i));
}

var dashCandidateSelect = ui.Select({

  items: candidateOptions,

  value: '1',

  onChange: updateFinalDashboard

});

dashPanel.add(dashCandidateSelect);

// 6. MAP LAYER SELECTOR

dashPanel.add(ui.Label({
  value: 'Select Map Visualization',
  style: {
    fontWeight: 'bold',
    margin: '12px 0 5px 0'
  }
}));

var dashLayerSelect = ui.Select({

  items: [
    'RGB',
    'Random Forest Classification',
    'NDVI',
    'Dynamic World',
    'RF-DW Bare Agreement'
  ],

  value: 'RGB',

  onChange: updateFinalDashboard

});

dashPanel.add(dashLayerSelect);

// 7. CANDIDATE INFORMATION

dashPanel.add(ui.Label({
  value: 'CANDIDATE INFORMATION',
  style: {
    fontWeight: 'bold',
    fontSize: '13px',
    margin: '18px 0 5px 0'
  }
}));

var dashCandidateInfo = ui.Label(
  'Loading candidate information...',
  {
    fontSize: '11px',
    whiteSpace: 'pre'
  }
);

dashPanel.add(dashCandidateInfo);

// 8. CHART PANEL

dashPanel.add(ui.Label({
  value: 'STATISTICAL ANALYSIS',
  style: {
    fontWeight: 'bold',
    fontSize: '13px',
    margin: '18px 0 5px 0'
  }
}));

var dashCharts = ui.Panel({
  style: {
    stretch: 'horizontal'
  }
});

dashPanel.add(dashCharts);

// =====================================================
// 9. MAIN DASHBOARD UPDATE FUNCTION
// =====================================================

function updateFinalDashboard() {

  var year = parseInt(
    dashYearSelect.getValue(),
    10
  );

  var candidateID = parseInt(
    dashCandidateSelect.getValue(),
    10
  );

  var layerMode = dashLayerSelect.getValue();

  // Selected candidate
  var selectedFeature = ee.Feature(
    candidateDetails
      .filter(
        ee.Filter.eq('candidate_id', candidateID)
      )
      .first()
  );

  var selectedGeometry = selectedFeature.geometry();

  // Get annual Random Forest image
  var rfImage = ee.Image(
    annualClassification
      .filter(ee.Filter.eq('year', year))
      .first()
  );

  // Reset map layers
  dashMap.layers().reset([]);

  // =================================================
  // 10. MAP VISUALIZATION
  // =================================================

  if (layerMode === 'RGB') {

    dashMap.addLayer(
      getS2Composite(year),
      {
        bands: ['B4', 'B3', 'B2'],
        min: 0.02,
        max: 0.30,
        gamma: 1.2
      },
      'Sentinel-2 RGB ' + year
    );

  }

  else if (
    layerMode === 'Random Forest Classification'
  ) {

    dashMap.addLayer(
      rfImage,
      {
        min: 0,
        max: 4,
        palette: [
          '006400',
          'FFFF00',
          'FF0000',
          '808080',
          '0000FF'
        ]
      },
      'Random Forest ' + year
    );

  }

  else if (layerMode === 'NDVI') {

    var selectedNDVI = getS2Composite(year)
      .normalizedDifference(['B8', 'B4']);

    dashMap.addLayer(
      selectedNDVI,
      {
        min: -0.2,
        max: 0.8,
        palette: [
          '8c510a',
          'd8b365',
          'f6e8c3',
          'a6d96a',
          '1a9850'
        ]
      },
      'NDVI ' + year
    );

  }

  else if (layerMode === 'Dynamic World') {

    var selectedDW = getCandidateDWLabel(year);

    dashMap.addLayer(
      selectedDW,
      {
        min: 0,
        max: 8,
        palette: [
          '419BDF',
          '397D49',
          '88B053',
          '7A87C6',
          'E49635',
          'DFC35A',
          'C4281B',
          'A59B8F',
          'B39FE1'
        ]
      },
      'Dynamic World ' + year
    );

  }

  else if (layerMode === 'RF-DW Bare Agreement') {

    var dwImage = getCandidateDWLabel(year);

    var agreement = rfImage.eq(2)
      .and(dwImage.eq(7))
      .selfMask();

    dashMap.addLayer(
      agreement,
      {
        palette: ['FF00FF']
      },
      'RF-DW Bare Agreement ' + year
    );

  }

  // =================================================
  // 11. DISPLAY CANDIDATE AND STUDY BOUNDARY
  // =================================================

  dashMap.addLayer(
    candidateDetails.style({
      color: '00FFFF',
      fillColor: '00000000',
      width: 1
    }),
    {},
    'All 13 Candidates'
  );

  dashMap.addLayer(
    ee.FeatureCollection([selectedFeature]).style({
      color: 'FFFF00',
      fillColor: 'FFFF0015',
      width: 3
    }),
    {},
    'Selected Candidate ' + candidateID
  );

  dashMap.addLayer(
    safShpFC.style({
      color: 'FFFFFF',
      fillColor: '00000000',
      width: 2
    }),
    {},
    'SAF Reference Study Area'
  );

  // Center map on selected candidate
  dashMap.centerObject(
    selectedGeometry,
    15
  );

  // =================================================
  // 12. UPDATE CANDIDATE INFORMATION
  // =================================================

  dashCandidateInfo.setValue(
    'Loading candidate information...'
  );

  selectedFeature.toDictionary([

    'area_ha',
    'latitude',
    'longitude',
    'priority',
    'ranking'

  ]).evaluate(function(info) {

    if (info !== null) {

      dashCandidateInfo.setValue(

        'Candidate ID: ' + candidateID + '\n' +

        'Area: ' +
        Number(info.area_ha).toFixed(2) +
        ' ha\n' +

        'Priority: ' + info.priority + '\n' +

        'Latitude: ' +
        Number(info.latitude).toFixed(6) + '\n' +

        'Longitude: ' +
        Number(info.longitude).toFixed(6)

      );

    }

  });

  // =================================================
  // 13. UPDATE TEMPORAL CHARTS
  // =================================================

  dashCharts.clear();

  var selectedTemporal = correctedTemporalStats
    .filter(
      ee.Filter.eq('candidate_id', candidateID)
    )
    .sort('year');

  // Bare percentage chart

  var barePercentChart = ui.Chart.feature.byFeature(
    selectedTemporal,
    'year',
    [
      'rf_bare_percent',
      'dw_bare_percent'
    ]
  )
  .setChartType('LineChart')
  .setOptions({

    title: 'Bare / Open Land Percentage',

    hAxis: {
      title: 'Year',
      format: '####'
    },

    vAxis: {
      title: 'Percentage (%)',
      viewWindow: {
        min: 0,
        max: 100
      }
    },

    lineWidth: 2,
    pointSize: 5,

    legend: {
      position: 'bottom'
    }

  });

  dashCharts.add(barePercentChart);

  // NDVI chart

  var candidateNDVIChart = ui.Chart.feature.byFeature(
    selectedTemporal,
    'year',
    ['ndvi_mean_corrected']
  )
  .setChartType('LineChart')
  .setOptions({

    title: 'Mean NDVI Trend',

    hAxis: {
      title: 'Year',
      format: '####'
    },

    vAxis: {
      title: 'Mean NDVI'
    },

    lineWidth: 2,
    pointSize: 5,

    legend: {
      position: 'none'
    }

  });

  dashCharts.add(candidateNDVIChart);

  // Regional annual bare area chart

  var regionalBare = annualAreaStatistics
    .filter(ee.Filter.eq('class_id', 2))
    .sort('year');

  var regionalChart = ui.Chart.feature.byFeature(
    regionalBare,
    'year',
    ['area_ha']
  )
  .setChartType('ColumnChart')
  .setOptions({

    title: 'Rembang Regional Bare / Open Land Area',

    hAxis: {
      title: 'Year',
      format: '####'
    },

    vAxis: {
      title: 'Area (ha)'
    },

    legend: {
      position: 'none'
    }

  });

  dashCharts.add(regionalChart);

}

// =====================================================
// 14. DASHBOARD FOOTNOTE
// =====================================================

dashPanel.add(ui.Label({

  value:
    'Note: Bare/Open Land candidates are not automatically ' +
    'verified mining locations. Independent visual and ' +
    'reference validation is required.',

  style: {
    fontSize: '10px',
    color: '#777777',
    margin: '15px 0 5px 0'
  }

}));


// ==========================================
// STAGE 34: FINAL DASHBOARD LAYOUT
// ==========================================

// Create split panel
var finalSplitPanel = ui.SplitPanel({

  firstPanel: dashPanel,

  secondPanel: dashMap,

  orientation: 'horizontal',

  wipe: false,

  style: {
    stretch: 'both'
  }

});

// Set dashboard as main interface
ui.root.widgets().reset([
  finalSplitPanel
]);

// Initialize dashboard
updateFinalDashboard();


// ==========================================
// STAGE 35: DASHBOARD LEGEND
// ==========================================

// LEGEND TITLE

dashPanel.add(ui.Label({
  value: 'LAND COVER CLASSIFICATION LEGEND',
  style: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#17365D',
    margin: '18px 0 8px 0'
  }
}));

// LEGEND PANEL

var legendPanel = ui.Panel({
  style: {
    stretch: 'horizontal',
    padding: '8px',
    border: '1px solid #DDDDDD'
  }
});


// ==========================================
// FIX: DASHBOARD LEGEND FUNCTION
// ==========================================

function addLegendItem(color, label) {

  // Color box
  var colorBox = ui.Label('', {
    backgroundColor: '#' + color,
    padding: '8px',
    margin: '0 8px 5px 0'
  });

  // Legend text
  var textLabel = ui.Label(label, {
    fontSize: '11px',
    margin: '0 0 5px 0'
  });

  // Horizontal legend row
  var legendRow = ui.Panel(
    [colorBox, textLabel],
    ui.Panel.Layout.Flow('horizontal')
  );

  legendPanel.add(legendRow);

}


// FIVE LAND COVER CLASSES

addLegendItem('006400', 'Vegetation');
addLegendItem('FFFF00', 'Agriculture');
addLegendItem('FF0000', 'Bare / Open Land');
addLegendItem('808080', 'Built-up');
addLegendItem('0000FF', 'Water');
addLegendItem('FF4500', 'Potential Bare Land Candidate');

dashPanel.add(legendPanel);



// ==========================================
// STAGE 35B: PROJECT INFORMATION
// ==========================================

dashPanel.add(ui.Label({
  value: 'PROJECT INFORMATION',
  style: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#17365D',
    margin: '18px 0 8px 0'
  }
}));

var projectInformation = ui.Label({

  value:
    'Study Area: Rembang Regency, Central Java\n' +
    'Monitoring Period: 2018-2025\n' +
    'Satellite Data: Sentinel-2 Surface Reflectance\n' +
    'Classification: Random Forest (100 Trees)\n' +
    'Reference Dataset: Dynamic World V1\n' +
    'Spatial Resolution: 20 meters\n' +
    'Analysis Platform: Google Earth Engine',

  style: {
    fontSize: '11px',
    color: '#555555',
    whiteSpace: 'pre',
    margin: '5px 0 10px 0'
  }

});

dashPanel.add(projectInformation);


// ==========================================
// STAGE 35C: METHODOLOGICAL DISCLAIMER
// ==========================================

dashPanel.add(ui.Label({

  value:
    'METHODOLOGICAL NOTE\n' +
    'Bare / Open Land is not automatically a verified ' +
    'mining footprint. Candidate locations require ' +
    'independent visual and reference validation. ' +
    'Historical classification uses the model trained ' +
    'with 2025 samples and should be interpreted cautiously.',

  style: {
    fontSize: '10px',
    color: '#777777',
    whiteSpace: 'pre',
    margin: '12px 0 10px 0'
  }

}));
