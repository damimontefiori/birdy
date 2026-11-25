import { SpeciesCatalogEntry } from '../types/domain';

/**
 * Especies emblemáticas de mariposas, abejas, abejorros, insectos, arácnidos
 * y pequeña fauna vecina que conviven en jardines y áreas naturales de Argentina (es_AR).
 */
export const BIOMA_FAUNA_EXTRAS: SpeciesCatalogEntry[] = [
  // ============================================================================
  // MARIPOSAS Y POLILLAS DIURNAS (Lepidoptera)
  // ============================================================================
  {
    taxonId: 'sp_heraclides_thoas',
    organismGroup: 'mariposas',
    scientificName: 'Heraclides thoas',
    commonNameAr: 'Mariposa limonera (cola de golondrina)',
    alternativeNames: ['Cola de golondrina', 'Mariposa de los cítricos', 'Limonera grande', 'Papilio thoas'],
    family: 'Papilionidae (Papiliónidos)',
    quickSummary: 'Grande y llamativa, de alas negras con una ancha banda diagonal amarillo vivo y características colas largas atrás.',
    sizeLabel: '9–12 cm de envergadura',
    habitatTag: 'Jardines con cítricos, flores y patios soleados',
    dietTag: 'Néctar floral (adulto) · Hojas de cítricos (oruga)',
    ecologicalRole: 'Gran polinizadora diurna de jardines con cítricos y flores',
    coexistenceNote: 'Totalmente inofensiva. Sus orugas se camuflan como excremento de pájaro sobre brotes de limonero o naranjo sin dañar árboles sanos.',
    gardenEcology: {
      seeksInGarden: 'Néctar abundante de flores soleadas y brotes de cítricos para depositar sus huevos.',
      preferredFlowers: 'Lantanas, salvias, jazmines, lavandas, hibiscos, verbenas y flores de cítricos (azahar).',
      preferredFruitTrees: 'Limonero, naranjo, mandarino, pomelo y quinoto (plantas hospederas de sus orugas).',
      insectsOrFoodEaten: 'No come insectos; el adulto liba néctar floral y la oruga come hojas tiernas de cítricos y ruda.',
    },
    identificationTraits:
      'Alas negras aterciopeladas cruzadas por una banda diagonal continua de manchas amarillo intenso, hilera submarginal de puntos amarillos y largas colas negras con centro amarillo en las alas posteriores.',
    typicalBehavior:
      'Vuelo potente y elegante recorriendo flores altas y revisando hojas jóvenes de limoneros o naranjos donde posa brevemente sus huevos.',
    dietAndHabitat:
      'Los adultos visitan flores ricas en néctar en jardines y quintas; sus orugas se alimentan de hojas de cítricos (Rutáceas) y ruda.',
    generalDistribution:
      'Muy común en el norte, litoral, centro y Cuyo de Argentina, habitual en Buenos Aires y alrededores.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Misiones', 'Tucumán', 'Mendoza'],
  },
  {
    taxonId: 'sp_battus_polydamas',
    organismGroup: 'mariposas',
    scientificName: 'Battus polydamas',
    commonNameAr: 'Mariposa borde de oro',
    alternativeNames: ['Borde de oro', 'Viudita de borde dorado'],
    family: 'Papilionidae (Papiliónidos)',
    quickSummary: 'Alas negro verdoso con una elegante corona continua de manchas amarillo dorado cerca de los bordes, sin colas.',
    sizeLabel: '7–9 cm de envergadura',
    habitatTag: 'Jardines con flores y enredaderas patito',
    dietTag: 'Néctar floral · Orugas en Aristolochia (patito)',
    ecologicalRole: 'Polinizadora vistosa de flores luminosas del jardín',
    coexistenceNote: 'Totalmente inofensiva. Su nombre proviene del borde dorado intenso que destaca contra el negro verdoso.',
    gardenEcology: {
      seeksInGarden: 'Flores ricas en néctar a pleno sol y enredaderas nativas (patito / mil hombres) para criar orugas.',
      preferredFlowers: 'Lantanas, zinnias, salvias rojas, cosmos, hibiscos y flores de duranta.',
      preferredFruitTrees: 'No depende de frutales; busca enredaderas nativas como flor de patito (Aristolochia).',
      insectsOrFoodEaten: 'No come insectos; los adultos toman néctar y las orugas consumen hojas de Aristolochia.',
    },
    identificationTraits:
      'Alas oscuras negro-verdosas sin colas posteriores, bordeadas por una banda submarginal nítida de manchas amarillas triangulares y reflejos rojizos en la cara ventral.',
    typicalBehavior:
      'Vuelo nervioso y rápido entre flores soleadas, aleteando incluso mientras liba néctar.',
    dietAndHabitat:
      'Visita canteros soleados con lantanas y salvias; sus orugas dependen de enredaderas nativas del género Aristolochia.',
    generalDistribution:
      'Norte, litoral y centro de Argentina hasta Buenos Aires y Córdoba.',
    typicalRegionsAr: ['Buenos Aires', 'Entre Ríos', 'Santa Fe', 'Córdoba', 'Misiones', 'Corrientes'],
  },
  {
    taxonId: 'sp_danaus_erippus',
    organismGroup: 'mariposas',
    scientificName: 'Danaus erippus',
    commonNameAr: 'Mariposa monarca del sur',
    alternativeNames: ['Monarca', 'Monarca sudamericana'],
    family: 'Nymphalidae (Ninfálidos)',
    quickSummary: 'Alas grandes anaranjadas con venas negras bien marcadas y bordes negros salpicados de puntos blancos.',
    sizeLabel: '8–10 cm de envergadura',
    habitatTag: 'Jardines con flores y asclepias',
    dietTag: 'Néctar de flores (adulto) · Asclepias (oruga)',
    ecologicalRole: 'Polinizadora migratoria e indicadora de jardines sanos',
    coexistenceNote: 'Totalmente inofensiva. Plantar bandera española (Asclepias curassavica) la invita a reproducirse en tu jardín.',
    gardenEcology: {
      seeksInGarden: 'Flores ricas en néctar para recargar energía y plantas de asclepia para poner sus huevos.',
      preferredFlowers: 'Bandera española (Asclepias), lantanas, lavandas, salvias, zinnias y cosmos.',
      preferredFruitTrees: 'No busca frutales; prefiere canteros soleados con asclepias y arbustos con flor.',
      insectsOrFoodEaten: 'No come insectos; liba néctar floral y sus orugas comen únicamente hojas de asclepias.',
    },
    identificationTraits:
      'Alas anaranjado intenso recorridas por venas negras gruesas, margen negro con doble hilera de puntitos blancos y cuerpo negro moteado.',
    typicalBehavior:
      'Vuelo planeado, pausado y elegante; visita flores luminosas al sol y realiza desplazamientos estacionales.',
    dietAndHabitat:
      'Los adultos liban néctar de lantanas, lavandas y zinnias; sus orugas rayadas se alimentan casi exclusivamente de asclepias.',
    generalDistribution:
      'Muy frecuente en el centro, norte, litoral y Cuyo de Argentina, llegando hasta el norte patagónico.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Misiones', 'Mendoza'],
  },
  {
    taxonId: 'sp_agraulis_vanillae',
    organismGroup: 'mariposas',
    scientificName: 'Agraulis vanillae',
    commonNameAr: 'Mariposa espejitos',
    alternativeNames: ['Espejitos', 'Pasionaria'],
    family: 'Nymphalidae (Ninfálidos)',
    quickSummary: 'Anaranjada brillante por arriba con manchas negras, y salpicada de llamativos espejos plateados al cerrar las alas.',
    sizeLabel: '6–7,5 cm de envergadura',
    habitatTag: 'Jardines con mburucuyá y flores',
    dietTag: 'Néctar · Orugas en mburucuyá (Passiflora)',
    ecologicalRole: 'Polinizadora habitual de jardines urbanos',
    coexistenceNote: 'Completamente inofensiva. Si tenés mburucuyá o pasionaria, suele depositar allí sus huevos y orugas.',
    gardenEcology: {
      seeksInGarden: 'Néctar de flores soleadas y enredaderas de mburucuyá (pasionaria) para reproducirse.',
      preferredFlowers: 'Mburucuyá (Passiflora), lantanas, verbenas, salvias, lavandas y margaritas.',
      preferredFruitTrees: 'Enredaderas frutales de pasionaria / maracuyá y cercos vivos soleados.',
      insectsOrFoodEaten: 'No come insectos; el adulto toma néctar y la oruga se alimenta de hojas de pasionaria.',
    },
    identificationTraits:
      'Alas alargadas anaranjado vivo en la cara dorsal; al cerrarse exhibe grandes manchas plateadas nacaradas inconfundibles.',
    typicalBehavior:
      'Vuelo ágil y soleado entre canteros y alambrados con enredaderas; suele asolearse abriendo y cerrando sus alas.',
    dietAndHabitat:
      'Muy asociada al mburucuyá (Passiflora caerulea) como planta hospedera y a flores ricas en néctar.',
    generalDistribution:
      'Común en casi todo el país salvo el extremo sur patagónico.',
    typicalRegionsAr: ['Buenos Aires', 'Litoral', 'Córdoba', 'Noroeste', 'Cuyo'],
  },
  {
    taxonId: 'sp_eurema_deva',
    organismGroup: 'mariposas',
    scientificName: 'Eurema deva',
    commonNameAr: 'Mariposa limoncito',
    alternativeNames: ['Limoncito', 'Amarillita de jardín'],
    family: 'Pieridae (Piéridos)',
    quickSummary: 'Pequeña y luminosa de color amarillo limón suave con punta negra en el ala anterior.',
    sizeLabel: '3–4 cm de envergadura',
    habitatTag: 'Céspedes, canteros y arbustos',
    dietTag: 'Néctar de flores pequeñas',
    ecologicalRole: 'Polinizadora de flores bajas y silvestres',
    coexistenceNote: 'Totalmente inofensiva y muy confiada en patios soleados.',
    gardenEcology: {
      seeksInGarden: 'Néctar de flores pequeñas a baja altura y arbustos leguminosos donde criar sus orugas.',
      preferredFlowers: 'Tréboles, verbenas, sen del campo (Senna corymbosa), margaritas y flores de huerta.',
      preferredFruitTrees: 'Arbustos nativos como sen del campo y espinillos; rara vez depende de frutales.',
      insectsOrFoodEaten: 'No come insectos; adultos nectarívoros y orugas herbívoras en leguminosas.',
    },
    identificationTraits:
      'Alas amarillo limón uniforme con ápice negro delicado en las alas delanteras; al posarse cierra las alas mostrando tonos crema.',
    typicalBehavior:
      'Vuela bajo y zigzagueante a ras del pasto, visitando tréboles, sen del campo y flores de huerta.',
    dietAndHabitat:
      'Liba néctar de flores pequeñas en jardines, plazas y banquinas; sus orugas se crían sobre leguminosas nativas.',
    generalDistribution:
      'Norte, litoral y centro argentino, muy habitual en Buenos Aires.',
    typicalRegionsAr: ['Buenos Aires', 'Santa Fe', 'Córdoba', 'Entre Ríos', 'Misiones'],
  },
  {
    taxonId: 'sp_morpho_epistrophus',
    organismGroup: 'mariposas',
    scientificName: 'Morpho epistrophus',
    commonNameAr: 'Mariposa bandera argentina',
    alternativeNames: ['Bandera argentina', 'Celeste de los montes'],
    family: 'Nymphalidae (Ninfálidos)',
    quickSummary: 'Grande y majestuosa, de color celeste nacarado brillante con bordes oscuros y ocelos en la cara inferior.',
    sizeLabel: '9–11 cm de envergadura',
    habitatTag: 'Arboledas, parques con coronillos y riberas',
    dietTag: 'Jugos de frutas maduras y savia',
    ecologicalRole: 'Emblema de biodiversidad en montes y jardines con árboles nativos',
    coexistenceNote: 'Totalmente inofensiva. Cuidar árboles nativos como coronillo o ingá favorece su presencia.',
    gardenEcology: {
      seeksInGarden: 'Fruta madura caída, savia fermentada y árboles nativos sombreados donde criar sus orugas.',
      preferredFlowers: 'Rara vez visita flores; prefiere jugos de fruta muy madura (banana, higo, durazno) y savia.',
      preferredFruitTrees: 'Coronillo, ingá, chal-chal y árboles frutales con fruta madura caída (higuera, duraznero, ciruelo).',
      insectsOrFoodEaten: 'No come insectos; se alimenta de jugos dulces de frutas fermentadas y savia.',
    },
    identificationTraits:
      'Alas amplias blanco celeste iridiscente con manchas marginales oscuras; por debajo presenta tonos crema y ojos (ocelos) en hilera.',
    typicalBehavior:
      'Planeo lento y ondulante a media altura entre la sombra y los claros de sol, sobre todo a fin del verano.',
    dietAndHabitat:
      'A diferencia de otras mariposas, prefiere frutas maduras caídas, savia fermentada y humedad del suelo.',
    generalDistribution:
      'Litoral, Delta del Paraná, ribera rioplatense y bosques del noreste argentino.',
    typicalRegionsAr: ['Buenos Aires', 'Entre Ríos', 'Corrientes', 'Misiones', 'Santa Fe'],
  },
  {
    taxonId: 'sp_vanessa_braziliensis',
    organismGroup: 'mariposas',
    scientificName: 'Vanessa braziliensis',
    commonNameAr: 'Dama pintada',
    alternativeNames: ['Perezosa', 'Dama manchada', 'Cuatro ojos rosada'],
    family: 'Nymphalidae (Ninfálidos)',
    quickSummary: 'Tonos salmón rosado, negro y manchas blancas en las puntas, con dos grandes ocelos en la cara inferior.',
    sizeLabel: '4,5–5,5 cm de envergadura',
    habitatTag: 'Jardines, baldíos floridos y caminos',
    dietTag: 'Néctar de compuestas y flores de jardín',
    ecologicalRole: 'Polinizadora generalista de flores silvestres y cultivadas',
    coexistenceNote: 'Inofensiva; suele posarse sobre caminos de tierra o muros tibios al sol.',
    gardenEcology: {
      seeksInGarden: 'Néctar de flores abiertas al sol y superficies cálidas para asolearse incluso en días frescos.',
      preferredFlowers: 'Margaritas, lavandas, salvias, marcelas, cardos y zinnias.',
      preferredFruitTrees: 'No busca frutales; frecuenta canteros abiertos, senderos y flora herbácea.',
      insectsOrFoodEaten: 'No come insectos; adultos nectarívoros y orugas sobre hojas de marcela y compuestas.',
    },
    identificationTraits:
      'Alas dorsales pardo negruzcas con amplias áreas rosado asalmonado y manchitas blancas apicales; cara ventral finamente jaspeada con dos ocelos.',
    typicalBehavior:
      'Alterna vuelos rápidos con largas pausas tomando sol con las alas abiertas en el suelo o sobre flores.',
    dietAndHabitat:
      'Visita margaritas, salvia, cardos y lavandas; presente incluso en días frescos de otoño e invierno.',
    generalDistribution:
      'Ampliamente distribuida en casi toda la Argentina.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Patagonia', 'Cuyo', 'Litoral', 'Noroeste'],
  },
  {
    taxonId: 'sp_junonia_genoveva',
    organismGroup: 'mariposas',
    scientificName: 'Junonia genoveva',
    commonNameAr: 'Mariposa cuatro ojos',
    alternativeNames: ['Cuatro ojos', 'Ojo de pavo', 'Bataraza'],
    family: 'Nymphalidae (Ninfálidos)',
    quickSummary: 'Parda aterciopelada con grandes ojos concéntricos azules y anaranjados en las alas.',
    sizeLabel: '4,5–5,5 cm de envergadura',
    habitatTag: 'Jardines soleados, plazas y pastizales',
    dietTag: 'Néctar de flores bajas (verbenas, lantanas)',
    ecologicalRole: 'Polinizadora diurna muy activa en días soleados',
    coexistenceNote: 'Totalmente inofensiva. Los falsos ojos de sus alas confunden a los depredadores.',
    gardenEcology: {
      seeksInGarden: 'Néctar de flores bajas al sol y claros cálidos donde asolearse con alas abiertas.',
      preferredFlowers: 'Verbenas, lantanas, margaritas, llantén y flores silvestres del césped.',
      preferredFruitTrees: 'No depende de árboles frutales; prefiere canteros soleados y pastizales bajos.',
      insectsOrFoodEaten: 'No come insectos; adulto nectarívoro y orugas sobre llantén y verbenáceas.',
    },
    identificationTraits:
      'Alas pardo oscuras con banda clara y llamativos ocelos (ojos) negros con núcleo azulado y aro ocre anaranjado.',
    typicalBehavior:
      'Territorial en su cantero: se posa en el suelo o en una flor con alas extendidas y sale a investigar cualquier movimiento.',
    dietAndHabitat:
      'Frecuente en jardines con verbenas, margaritas y llantén, sobre todo en verano y otoño.',
    generalDistribution:
      'Centro, norte y litoral argentino.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Tucumán'],
  },
  {
    taxonId: 'sp_aellopos_titan',
    organismGroup: 'mariposas',
    scientificName: 'Aellopos titan',
    commonNameAr: 'Polilla colibrí',
    alternativeNames: ['Esfinge colibrí', 'Mariposa picaflor'],
    family: 'Sphingidae (Esfíngidos)',
    quickSummary: 'Polilla diurna robusta que aletea suspendida frente a las flores igual que un picaflor, con faja blanca en el abdomen.',
    sizeLabel: '5–6 cm de envergadura',
    habitatTag: 'Jardines con flores tubulares (salvia, jazmín)',
    dietTag: 'Néctar tomado en vuelo estacionario',
    ecologicalRole: 'Excelente polinizadora de flores profundas al atardecer y al sol',
    coexistenceNote: 'Completamente inofensiva; muchas personas la confunden a primera vista con un pequeño picaflor.',
    gardenEcology: {
      seeksInGarden: 'Néctar profundo de flores tubulares y aromáticas al sol y al atardecer.',
      preferredFlowers: 'Salvia guaranítica, lantanas, durantas, madreselvas, jazmines y petunias.',
      preferredFruitTrees: 'Arbustos floridos y enredaderas; rara vez busca árboles frutales.',
      insectsOrFoodEaten: 'No come insectos; liba néctar en vuelo con su larga espiritrompa.',
    },
    identificationTraits:
      'Cuerpo fusiforme pardo oscuro con banda blanca nítida cruzando el abdomen, alas angostas y larga espiritrompa desenrollada al libar.',
    typicalBehavior:
      'Aleteo velocísimo casi invisible que le permite quedarse flotando frente a cada flor sin posarse.',
    dietAndHabitat:
      'Busca flores tubulares ricas en néctar como salvias, lantanas, durantas y madreselvas.',
    generalDistribution:
      'Norte, litoral y centro del país, frecuente en jardines urbanos en verano.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Litoral', 'Noroeste'],
  },
  {
    taxonId: 'sp_ascia_monuste',
    organismGroup: 'mariposas',
    scientificName: 'Ascia monuste',
    commonNameAr: 'Mariposa blanca de la col',
    alternativeNames: ['Lechera', 'Blanca del jardín'],
    family: 'Pieridae (Piéridos)',
    quickSummary: 'Alas blancas puras con delicado borde negro aserrado en las puntas y antenas con extremo celeste.',
    sizeLabel: '5–6 cm de envergadura',
    habitatTag: 'Huertas, jardines y parques',
    dietTag: 'Néctar de flores variadas',
    ecologicalRole: 'Polinizadora abundante y migradora estival',
    coexistenceNote: 'Inofensiva; sus orugas pueden comer hojas de repollo, rúcula o taco de reina en la huerta.',
    gardenEcology: {
      seeksInGarden: 'Néctar de flores soleadas y crucíferas de huerta para poner huevos.',
      preferredFlowers: 'Taco de reina, lavandas, salvias, lantanas, albahaca y flores de rúcula o repollo.',
      preferredFruitTrees: 'No busca frutales; prefiere huertas familiares y canteros floridos.',
      insectsOrFoodEaten: 'No come insectos; el adulto liba néctar y la oruga come hojas de repollo, kale, rúcula o taco de reina.',
    },
    identificationTraits:
      'Coloración blanca cremosa en ambas alas con margen apical negro dentado; algunos ejemplares presentan tono gris ahumado.',
    typicalBehavior:
      'Vuelo enérgico a pleno sol, a veces en grandes bandadas migratorias durante días calurosos.',
    dietAndHabitat:
      'Muy habitual en huertas familiares, canteros y jardines urbanos.',
    generalDistribution:
      'Todo el norte, centro, Cuyo y litoral argentino.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Litoral', 'Noroeste'],
  },

  // ============================================================================
  // ABEJAS Y ABEJORROS (Anthophila — Polinizadores clave)
  // ============================================================================
  {
    taxonId: 'sp_xylocopa_augusti',
    organismGroup: 'abejas_abejorros',
    scientificName: 'Xylocopa augusti',
    commonNameAr: 'Mangangá negro',
    alternativeNames: ['Mangangá', 'Abejorro carpintero', 'Mangangá de madera'],
    family: 'Apidae (Ápidos)',
    quickSummary: 'Abejorro grande y robusto, negro azabache con pelitos anaranjados en los costados y zumbido grave inconfundible.',
    sizeLabel: '2,5–3 cm · Grande',
    habitatTag: 'Jardines con flores grandes y maderas secas',
    dietTag: 'Néctar y polen de flores (pasionaria, salvias)',
    ecologicalRole: 'Superpolinizador nativo (polinización por vibración)',
    coexistenceNote: 'Muy pacífico pese a su tamaño imponente: los machos no tienen aguijón y las hembras solo pican si se las aprieta.',
    gardenEcology: {
      seeksInGarden: 'Flores grandes para polinizar por vibración y maderas secas o cañas donde hacer su nido.',
      preferredFlowers: 'Mburucuyá (pasionaria), salvias azules, flores de tomate, berenjena, zapallo y bignonias.',
      preferredFruitTrees: 'Cítricos en flor, maracuyá, palta y árboles de floración abundante.',
      insectsOrFoodEaten: 'No come insectos; recolecta polen y néctar floral para alimentar a sus larvas.',
    },
    identificationTraits:
      'Cuerpo ancho negro brillante con alas oscuras de reflejo violáceo; la hembra muestra flecos rojizos/naranja en los bordes del abdomen.',
    typicalBehavior:
      'Visita flores con un zumbido grave y poderoso; excava galerías limpias en ramas secas o postes para criar a sus larvas.',
    dietAndHabitat:
      'Esencial para polinizar mburucuyá, tomates, berenjenas, salvias y flores tubulares del jardín.',
    generalDistribution:
      'Centro, norte y litoral de Argentina, muy común en Buenos Aires y alrededores.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Misiones', 'Cuyo'],
  },
  {
    taxonId: 'sp_bombus_pauloensis',
    organismGroup: 'abejas_abejorros',
    scientificName: 'Bombus pauloensis',
    commonNameAr: 'Abejorro negro y amarillo',
    alternativeNames: ['Mangangá amarillo', 'Abejorro nativo', 'Bombus'],
    family: 'Apidae (Ápidos)',
    quickSummary: 'Muy peludo y redondeado, negro con franjas amarillo intenso (o totalmente negro en su forma melánica).',
    sizeLabel: '1,8–2,5 cm · Robusto',
    habitatTag: 'Jardines floridos, huertas y pastizales',
    dietTag: 'Polen y néctar',
    ecologicalRole: 'Polinizador nativo insustituible incluso en días frescos o nublados',
    coexistenceNote: 'Tranquilo mientras trabaja en las flores; evitar pisar o molestar sus nidos subterráneos.',
    gardenEcology: {
      seeksInGarden: 'Polen y néctar abundante desde temprano en la mañana, incluso con fresco o llovizna.',
      preferredFlowers: 'Lavandas, salvias, romero, flores de zapallo, tomate, tréboles y borraja.',
      preferredFruitTrees: 'Frutales en floración (manzano, duraznero, ciruelo, cítricos y arándanos).',
      insectsOrFoodEaten: 'No come insectos; se alimenta exclusivamente de polen y néctar floral.',
    },
    identificationTraits:
      'Aspecto aterciopelado denso, patas traseras con cestitas para cargar bolitas de polen y franjas amarillo dorado sobre negro.',
    typicalBehavior:
      'Trabaja incansablemente flor por flor desde temprano, incluso con temperaturas bajas donde otras abejas descansan.',
    dietAndHabitat:
      'Aprecia lavandas, salvias, romero, flores de zapallo, tréboles y flora nativa.',
    generalDistribution:
      'Muy extendido desde el norte y centro hasta la Patagonia norte.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Cuyo', 'Noroeste'],
  },
  {
    taxonId: 'sp_apis_mellifera',
    organismGroup: 'abejas_abejorros',
    scientificName: 'Apis mellifera',
    commonNameAr: 'Abeja melífera',
    alternativeNames: ['Abeja doméstica', 'Abeja de la miel', 'Abeja común'],
    family: 'Apidae (Ápidos)',
    quickSummary: 'Mediana, dorada acanelada con franjas oscuras en el abdomen y cestitas de polen en las patas traseras.',
    sizeLabel: '1,2–1,5 cm · Mediana',
    habitatTag: 'Todo tipo de flores, frutales y bebederos',
    dietTag: 'Néctar y polen',
    ecologicalRole: 'Polinizadora clave de frutales, aromáticas y flores de jardín',
    coexistenceNote: 'En las flores es muy mansa y no busca picar; solo se defiende si se la aplasta o se perturba su colmena.',
    gardenEcology: {
      seeksInGarden: 'Néctar, polen de flores aromáticas o frutales y agua fresca en días de calor.',
      preferredFlowers: 'Romero, lavanda, albahaca en flor, salvia, girasol, cosmos y margaritas.',
      preferredFruitTrees: 'Limonero, naranjo, manzano, ciruelo, duraznero, níspero y palta en flor.',
      insectsOrFoodEaten: 'No come insectos; recolecta néctar y polen para producir miel y alimento de la colmena.',
    },
    identificationTraits:
      'Tórax velloso ocre dorado, abdomen con bandas alternadas ámbar y marrón oscuro, alas membranosas transparentes.',
    typicalBehavior:
      'Visita flores de manera metódica y también bebe agua en platitos húmedos o bordes de piletas en días de calor.',
    dietAndHabitat:
      'Frecuenta cítricos, romero, lavanda, albahaca en flor y casi cualquier especie melífera.',
    generalDistribution:
      'Presente en prácticamente todo el territorio argentino.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Patagonia', 'Cuyo', 'Litoral', 'Noroeste'],
  },
  {
    taxonId: 'sp_tetragonisca_fiebrigi',
    organismGroup: 'abejas_abejorros',
    scientificName: 'Tetragonisca fiebrigi',
    commonNameAr: 'Abejita yateí',
    alternativeNames: ['Yateí', 'Abeja sin aguijón', 'Rubita'],
    family: 'Apidae (Meliponini)',
    quickSummary: 'Diminuta y estilizada, de color miel dorado con patas largas y vuelo suspendido cerca de la entrada de su nido.',
    sizeLabel: '4–5 mm · Diminuta',
    habitatTag: 'Jardines arbolados, huecos de muros y troncos',
    dietTag: 'Néctar y polen de flores pequeñas',
    ecologicalRole: 'Polinizadora nativa sin aguijón de flora silvestre y frutales',
    coexistenceNote: '100% inofensiva (no tiene aguijón funcional). Sus tubitos de cera en huecos de paredes son un tesoro ecológico.',
    gardenEcology: {
      seeksInGarden: 'Flores pequeñas con néctar y huecos protegidos en troncos o paredes para anidar.',
      preferredFlowers: 'Aromáticas en flor (albahaca, menta, orégano, cilantro), durantas y flora nativa pequeña.',
      preferredFruitTrees: 'Cítricos, pitanga, guayabo, níspero y frutales de flores pequeñas.',
      insectsOrFoodEaten: 'No come insectos; recoge polen, néctar y resinas vegetales.',
    },
    identificationTraits:
      'Muy pequeña y esbelta, abdomen amarillo miel, tórax oscuro y patas posteriores anchas que cargan polen claro.',
    typicalBehavior:
      'Construye un pequeño tubito de cera en la entrada de su refugio custodiado por abejitas guardianas flotando en el aire.',
    dietAndHabitat:
      'Visita flores diminutas de aromáticas, cítricos y plantas nativas en climas templados y cálidos.',
    generalDistribution:
      'Norte y litoral argentino, cada vez más valorada en jardines urbanos templados.',
    typicalRegionsAr: ['Misiones', 'Corrientes', 'Entre Ríos', 'Santa Fe', 'Noroeste', 'Buenos Aires'],
  },
  {
    taxonId: 'sp_megachile',
    organismGroup: 'abejas_abejorros',
    scientificName: 'Megachile',
    commonNameAr: 'Abeja cortadora de hojas',
    alternativeNames: ['Abeja albañil', 'Cortadora de rosas', 'Megachile'],
    family: 'Megachilidae (Megaquílidos)',
    quickSummary: 'Abeja solitaria grisácea u oscura que lleva el polen pegado debajo del abdomen en lugar de las patas.',
    sizeLabel: '1–1,4 cm · Pequeña',
    habitatTag: 'Jardines con rosales, leguminosas y cañas huecas',
    dietTag: 'Polen y néctar',
    ecologicalRole: 'Gran polinizadora solitaria de alta eficiencia',
    coexistenceNote: 'Muy dócil y solitaria (no forma enjambres). Los semicírculos prolijos en hojas de rosal son su firma y no dañan la planta.',
    gardenEcology: {
      seeksInGarden: 'Polen de flores soleadas, discos de hojas blandas (rosal) y cañas huecas para armar celdillas.',
      preferredFlowers: 'Rosales (para recortar hojas), lavandas, salvias, girasoles, caléndulas y leguminosas.',
      preferredFruitTrees: 'Cítricos y frutales de flor abierta; también busca ramas o cañas huecas.',
      insectsOrFoodEaten: 'No come insectos; se alimenta de polen y néctar (las hojas solo las usa para tapizar su nido).',
    },
    identificationTraits:
      'Cabeza ancha, abdomen algo aplanado con cepillo ventral dorado o blanquecino (escopa) que suele verse cubierto de polen.',
    typicalBehavior:
      'Corta pequeños discos perfectos en bordes de hojas blandas para tapizar las celdillas de su nido en tallos huecos.',
    dietAndHabitat:
      'Frecuenta flores de compuestas, lavandas, salvia y leguminosas.',
    generalDistribution:
      'Amplia distribución en jardines y campos de toda la Argentina.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Cuyo', 'Litoral', 'Patagonia'],
  },
  {
    taxonId: 'sp_augochlora',
    organismGroup: 'abejas_abejorros',
    scientificName: 'Augochlora',
    commonNameAr: 'Abeja metálica verde',
    alternativeNames: ['Abeja esmeralda', 'Abejita verde brillante', 'Halíctida'],
    family: 'Halictidae (Halíctidos)',
    quickSummary: 'Pequeña joya voladora de color verde esmeralda metálico reluciente al sol sobre flores abiertas.',
    sizeLabel: '7–10 mm · Pequeña',
    habitatTag: 'Canteros soleados, huertas y flores nativas',
    dietTag: 'Néctar y polen',
    ecologicalRole: 'Polinizadora nativa especialista en flores abiertas',
    coexistenceNote: 'Muy tranquila e inofensiva; suele pasar inadvertida como una mosquita brillante hasta que la mirás de cerca.',
    gardenEcology: {
      seeksInGarden: 'Polen y néctar en flores abiertas a pleno sol y suelo sin cemento o madera blanda para anidar.',
      preferredFlowers: 'Margaritas, cosmos, caléndulas, salvias, albahaca y flores nativas abiertas.',
      preferredFruitTrees: 'Frutales en flor y huertas orgánicas sin insecticidas.',
      insectsOrFoodEaten: 'No come insectos; consume exclusivamente polen y néctar floral.',
    },
    identificationTraits:
      'Cuerpo compacto completamente verde esmeralda o turquesa metálico brillante, alas claras y antenas oscuras.',
    typicalBehavior:
      'Activa en horas de sol pleno, rebuscando polen en el centro de margaritas, cosmos, caléndulas y salvias.',
    dietAndHabitat:
      'Nidifica en suelos sin cemento o maderas blandas; adora jardines biodiversos sin pesticidas.',
    generalDistribution:
      'Muy común en el centro, norte y litoral argentino.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Misiones', 'Noroeste'],
  },

  // ============================================================================
  // OTROS INSECTOS Y ARÁCNIDOS DEL JARDÍN
  // ============================================================================
  {
    taxonId: 'sp_cycloneda_sanguinea',
    organismGroup: 'insectos_aracnidos',
    scientificName: 'Cycloneda sanguinea',
    commonNameAr: 'Vaquita de San Antonio',
    alternativeNames: ['Vaquita roja', 'Mariquita', 'Chinita'],
    family: 'Coccinellidae (Coccinélidos)',
    quickSummary: 'Escarabajo diminuto semiesférico de élitros naranja rojizo liso sin puntos y escudo negro con manchas blancas.',
    sizeLabel: '4–6 mm · Diminuta',
    habitatTag: 'Brotes tiernos, rosales y huertas',
    dietTag: 'Pulgones y cochinillas',
    ecologicalRole: 'Aliada estrella del jardín: devora cientos de pulgones de forma natural',
    coexistenceNote: '100% inofensiva y enormemente beneficiosa. Si ves una en tus plantas, está cuidando tu jardín de plagas.',
    gardenEcology: {
      seeksInGarden: 'Colonias de pulgones y cochinillas en brotes tiernos de plantas y huerta.',
      preferredFlowers: 'Rosales, caléndulas, hinojo, cilantro, cosmos y margaritas (polen complementario).',
      preferredFruitTrees: 'Limonero, naranjo, duraznero e higuera cuando tienen brotes con pulgones.',
      insectsOrFoodEaten: 'Devora pulgones, cochinillas blandas, ácaros y huevos de plagas (hasta 50 pulgones por día).',
    },
    identificationTraits:
      'Cuerpo ovalado brillante rojo anaranjado uniforme (sin lunares negros en la espalda) y pronoto negro con dibujo blanco.',
    typicalBehavior:
      'Recorre tallos y hojas buscando colonias de pulgones; tanto adultos como sus larvas oscuras son grandes depredadores.',
    dietAndHabitat:
      'Frecuente en rosales, cítricos, aromáticas y cualquier planta con brotes nuevos.',
    generalDistribution:
      'Presente en casi todo el país.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Litoral', 'Cuyo', 'Noroeste'],
  },
  {
    taxonId: 'sp_coptopteryx_argentina',
    organismGroup: 'insectos_aracnidos',
    scientificName: 'Coptopteryx argentina',
    commonNameAr: 'Mamboretá',
    alternativeNames: ['Mantis religiosa', 'Tata Dios', 'Mantis argentina'],
    family: 'Coptopterygidae (Mántidos)',
    quickSummary: 'Cuerpo estilizado verde o pardo seco, cabeza triangular giratoria y patas delanteras plegadas en postura de acecho.',
    sizeLabel: '5–8 cm · Mediano a grande',
    habitatTag: 'Arbustos, cercos vivos y plantas con flor',
    dietTag: 'Moscas, langostas y otros insectos',
    ecologicalRole: 'Depredador natural que mantiene equilibrados los insectos del jardín',
    coexistenceNote: 'Inofensivo para las personas (no es venenoso ni pica); le gusta quedarse inmóvil camuflado entre ramas.',
    gardenEcology: {
      seeksInGarden: 'Arbustos soleados y plantas con flores donde emboscar insectos que se acercan.',
      preferredFlowers: 'Arbustos floridos, rosales, lavandas, salvias y cercos vivos (como posadero de caza).',
      preferredFruitTrees: 'Ramas de cítricos, frutales y arbustos altos con buen follaje para camuflarse.',
      insectsOrFoodEaten: 'Caza moscas, langostas, grillos, polillas, chinches y pequeños escarabajos.',
    },
    identificationTraits:
      'Tórax largo y fino, cabeza triangular con grandes ojos laterales que gira para mirarte y patas anteriores raptoras con espinitas.',
    typicalBehavior:
      'Caza al acecho balanceándose suavemente como una hoja movida por la brisa.',
    dietAndHabitat:
      'Vive entre arbustos, enredaderas y cercos soleados durante primavera, verano y otoño.',
    generalDistribution:
      'Muy frecuente en el centro, litoral y norte de Argentina.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'La Pampa', 'Cuyo'],
  },
  {
    taxonId: 'sp_erythrodiplax_umbrata',
    organismGroup: 'insectos_aracnidos',
    scientificName: 'Erythrodiplax umbrata',
    commonNameAr: 'Alguacil de bandas',
    alternativeNames: ['Libélula', 'Alguacil', 'Caballito del diablo'],
    family: 'Libellulidae (Libelúlidos)',
    quickSummary: 'Libélula ágil de cuerpo estilizado y alas transparentes que en el macho llevan una ancha banda oscura.',
    sizeLabel: '4–5 cm · Mediano',
    habitatTag: 'Jardines, piletas, estanques y parques',
    dietTag: 'Mosquitos, jejenes y moscas al vuelo',
    ecologicalRole: 'Controladora voraz de mosquitos en patios y jardines',
    coexistenceNote: 'Totalmente inofensiva (no pica ni muerde a las personas). Una gran aliada contra los mosquitos.',
    gardenEcology: {
      seeksInGarden: 'Insectos voladores para cazar al vuelo, perchas soleadas (cañas/ramas) y agua cercana.',
      preferredFlowers: 'No liba flores; usa tallos altos, juncos, achiras y plantas acuáticas como mirador.',
      preferredFruitTrees: 'No busca frutales; prefiere espacios abiertos soleados cerca de estanques o fuentes.',
      insectsOrFoodEaten: 'Gran cazadora aérea de mosquitos, jejenes, moscas pequeñas y tábanos.',
    },
    identificationTraits:
      'Ojos grandes globosos, cuatro alas extendidas horizontalmente en reposo y abdomen fino; el macho maduro presenta franja oscura en cada ala.',
    typicalBehavior:
      'Patrulla en vuelo veloz y vuelve una y otra vez a posarse en la punta de la misma caña, alambre o ramita.',
    dietAndHabitat:
      'Frecuenta jardines incluso lejos del agua, y especialmente patios con estanques o fuentes.',
    generalDistribution:
      'Norte, centro y litoral argentino.',
    typicalRegionsAr: ['Buenos Aires', 'Santa Fe', 'Córdoba', 'Entre Ríos', 'Corrientes', 'Misiones'],
  },
  {
    taxonId: 'sp_quesada_gigas',
    organismGroup: 'insectos_aracnidos',
    scientificName: 'Quesada gigas',
    commonNameAr: 'Chicharra grande',
    alternativeNames: ['Chicharra', 'Cigarra', 'Coyuyo'],
    family: 'Cicadidae (Cicádidos)',
    quickSummary: 'Insecto robusto verde oliva y pardo con grandes alas transparentes venadas; su canto agudo anuncia los días de calor.',
    sizeLabel: '4,5–5,5 cm · Grande',
    habitatTag: 'Troncos y copas de árboles en verano',
    dietTag: 'Savia de árboles',
    ecologicalRole: 'Parte clásica del ciclo veraniego del arbolado y alimento de aves',
    coexistenceNote: 'Totalmente inofensiva (no pica ni muerde). A veces encontrás su mudita vacía abrazada al tronco.',
    gardenEcology: {
      seeksInGarden: 'Árboles grandes para beber savia, mudar su exoesqueleto y cantar en tardes calurosas.',
      preferredFlowers: 'No visita flores; vive en troncos y ramas altas del arbolado.',
      preferredFruitTrees: 'Árboles añosos, jacarandá, tipa, fresno, paraíso y frutales grandes de tronco firme.',
      insectsOrFoodEaten: 'No come insectos ni hojas; succiona pequeñas gotas de savia de las ramas.',
    },
    identificationTraits:
      'Cuerpo macizo camuflado en verde oliva y marrón, ojos separados a los costados de la cabeza y alas cristalinas más largas que el cuerpo.',
    typicalBehavior:
      'Los machos cantan con fuerza en horas calurosas y al atardecer desde ramas altas; suelen quedar muy quietas al posarse.',
    dietAndHabitat:
      'Habita árboles de vereda, parques y jardines arbolados durante el verano.',
    generalDistribution:
      'Muy conocida en el centro, norte y litoral de la Argentina.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Tucumán', 'Misiones'],
  },
  {
    taxonId: 'sp_diloboderus_abderus',
    organismGroup: 'insectos_aracnidos',
    scientificName: 'Diloboderus abderus',
    commonNameAr: 'Bicho torito',
    alternativeNames: ['Torito', 'Cascarudo', 'Bicho candado'],
    family: 'Scarabaeidae (Escarabeidos)',
    quickSummary: 'Escarabajo robusto negro brillante; el macho luce un característico cuerno curvado en la cabeza.',
    sizeLabel: '1,8–2,5 cm · Mediano',
    habitatTag: 'Céspedes, tierra suelta y luces nocturnas',
    dietTag: 'Materia vegetal y raíces (larva)',
    ecologicalRole: 'Reciclador y aireador natural del suelo de jardines y pastizales',
    coexistenceNote: 'Inofensivo; los machos solo usan su cuerno en luchas rituales con otros machos. En verano suele acercarse a luces del patio.',
    gardenEcology: {
      seeksInGarden: 'Tierra suelta bajo el césped para completar su ciclo y luces cálidas del patio en verano.',
      preferredFlowers: 'No visita flores; habita suelos con pasto y materia orgánica.',
      preferredFruitTrees: 'No busca árboles frutales; se asocia a jardines con césped amplio.',
      insectsOrFoodEaten: 'No come insectos; sus larvas reciclan materia orgánica y raíces finas en la tierra (el adulto casi no se alimenta).',
    },
    identificationTraits:
      'Cuerpo compacto negro azabache (la hembra sin cuerno) con patas fuertes cavadoras; el macho lleva un cuerno cefálico bien curvo.',
    typicalBehavior:
      'De hábitos mayormente crepusculares y nocturnos durante el verano, con vuelo pesado y zumbador.',
    dietAndHabitat:
      'Frecuente en parques, jardines con césped y zonas rurales.',
    generalDistribution:
      'Región pampeana, centro y litoral argentino.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'La Pampa'],
  },
  {
    taxonId: 'sp_acromyrmex_lundi',
    organismGroup: 'insectos_aracnidos',
    scientificName: 'Acromyrmex lundi',
    commonNameAr: 'Hormiga negra podadora',
    alternativeNames: ['Hormiga negra', 'Hormiga cortadora', 'Podadora'],
    family: 'Formicidae (Formícidos)',
    quickSummary: 'Hormiga negra mate con espinitas en el tórax que forma largos senderos cargando pedacitos de hojas y pétalos.',
    sizeLabel: '5–9 mm · Pequeña',
    habitatTag: 'Jardines, patios, veredas y parques',
    dietTag: 'Cultiva un hongo subterráneo con las hojas que corta',
    ecologicalRole: 'Ingeniera del suelo: airea la tierra y recicla materia vegetal',
    coexistenceNote: 'No tiene aguijón venenoso (solo puede dar un pellizco leve). Si protege rosales, conviene usar barreras físicas ecológicas.',
    gardenEcology: {
      seeksInGarden: 'Hojas tiernas y pétalos para cultivar el hongo del que se alimenta su hormiguero.',
      preferredFlowers: 'Suele cortar hojas y pétalos de rosales, jazmines, hibiscos y brotes tiernos.',
      preferredFruitTrees: 'Brotes jóvenes de cítricos (limonero, naranjo) y frutales recién plantados.',
      insectsOrFoodEaten: 'No come insectos ni las hojas directamente: usa las hojas como sustrato para cultivar un hongo subterráneo.',
    },
    identificationTraits:
      'Color negro opaco, cuerpo algo áspero con pequeñas espinas dorsales y mandíbulas fuertes; caminan en filas muy organizadas.',
    typicalBehavior:
      'Incansable agricultora: las hojas que corta no las come directamente, sino que las usa para alimentar el hongo del hormiguero.',
    dietAndHabitat:
      'Presente en casi todos los jardines templados; más activa en tardes cálidas y noches de primavera y verano.',
    generalDistribution:
      'Muy común en Buenos Aires, centro y litoral argentino.',
    typicalRegionsAr: ['Buenos Aires', 'Santa Fe', 'Córdoba', 'Entre Ríos', 'La Pampa'],
  },
  {
    taxonId: 'sp_argiope_argentata',
    organismGroup: 'insectos_aracnidos',
    scientificName: 'Argiope argentata',
    commonNameAr: 'Araña tigre de jardín',
    alternativeNames: ['Araña plateada', 'Araña de la cruz', 'Tejedora plateada'],
    family: 'Araneidae (Araneidos)',
    quickSummary: 'Araña tejedora diurna con abdomen plateado brillante y patas rayadas, parada en el centro de una tela con zigzag blanco.',
    sizeLabel: '1,5–2,5 cm (con patas hasta 5 cm)',
    habitatTag: 'Arbustos, cercos soleados y plantas altas',
    dietTag: 'Mosquitos, moscas y otros insectos voladores',
    ecologicalRole: 'Gran aliada silenciosa que atrapa mosquitos e insectos en el jardín',
    coexistenceNote: 'Inofensiva y muy pacífica (no es de importancia médica). Vive en su tela al aire libre y rara vez entra a las casas.',
    gardenEcology: {
      seeksInGarden: 'Arbustos soleados y plantas altas donde tender su tela para atrapar insectos voladores.',
      preferredFlowers: 'No come flores; elige cercos vivos, agaves, salvias altas y rosales como soporte.',
      preferredFruitTrees: 'Ramas externas de cítricos y arbustos soleados con paso de insectos.',
      insectsOrFoodEaten: 'Atrapa mosquitos, moscas, langostas, chinches y pequeños escarabajos voladores.',
    },
    identificationTraits:
      'Abdomen lobulado plateado nacarado con tonos amarillos y negros; agrupa sus patas de a pares formando una X sobre una seda en zigzag (estabilimento).',
    typicalBehavior:
      'Permanece inmóvil cabeza abajo en el centro de su tela circular durante todo el día.',
    dietAndHabitat:
      'Teje sus telas amplias entre ramas soleadas de arbustos, agaves y cercos vivos.',
    generalDistribution:
      'Amplia presencia en el norte, centro, Cuyo y litoral de Argentina.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Misiones', 'Cuyo'],
  },
  {
    taxonId: 'sp_menemerus_bivittatus',
    organismGroup: 'insectos_aracnidos',
    scientificName: 'Menemerus bivittatus',
    commonNameAr: 'Araña saltarina gris',
    alternativeNames: ['Arañita saltarina', 'Saltícida', 'Araña saltona'],
    family: 'Salticidae (Saltícidos)',
    quickSummary: 'Pequeña araña curiosa de grandes ojos frontales y cuerpo peludito gris y blanco que salta para cazar sin tejer tela.',
    sizeLabel: '7–10 mm · Pequeña',
    habitatTag: 'Muros soleados, ventanas, macetas y ramas',
    dietTag: 'Mosquitos, moscas chicas y hormigas',
    ecologicalRole: 'Cazadora diurna de insectos pequeños en balcones y patios',
    coexistenceNote: '100% inofensiva y muy curiosa: gira la cabeza para observarte y controla mosquitos sin dejar telarañas.',
    gardenEcology: {
      seeksInGarden: 'Paredes tibias al sol, macetas y ventanas donde acechar insectos pequeños sin hacer telarañas.',
      preferredFlowers: 'Recorre macetas, aromáticas y bordes de canteros en busca de presas.',
      preferredFruitTrees: 'No depende de frutales; prefiere muros, pérgolas y troncos soleados.',
      insectsOrFoodEaten: 'Caza mosquitos, mosquitas de la fruta, moscas chicas, pulgones y hormigas.',
    },
    identificationTraits:
      'Cuerpo compacto velloso con franjas grises, negras y crema, y un par de ojos frontales grandes muy expresivos.',
    typicalBehavior:
      'Camina a saltitos cortos y precisos; no construye telas para cazar, solo un hilo de seguridad al brincar.',
    dietAndHabitat:
      'Muy habitual en paredes tibias al sol, marcos de ventanas y macetas de jardín.',
    generalDistribution:
      'Cosmopolita y muy frecuente en áreas urbanas de toda la Argentina.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Litoral', 'Cuyo', 'Noroeste'],
  },
  {
    taxonId: 'sp_armadillidium_vulgare',
    organismGroup: 'insectos_aracnidos',
    scientificName: 'Armadillidium vulgare',
    commonNameAr: 'Bicho bolita',
    alternativeNames: ['Bichito bolita', 'Cochinilla de la humedad'],
    family: 'Armadillidiidae (Crustáceos terrestres)',
    quickSummary: 'Pequeño crustáceo terrestre gris pizarra con caparazón articulado que se enrolla en una esfera perfecta al tocarlo.',
    sizeLabel: '1–1,5 cm · Pequeño',
    habitatTag: 'Debajo de macetas, piedras, hojarasca y compost',
    dietTag: 'Hojas secas y materia orgánica en descomposición',
    ecologicalRole: 'Gran compostador natural: transforma hojas caídas en humus fértil',
    coexistenceNote: 'Totalmente inofensivo (no muerde ni transmite enfermedades) y señal de suelo húmedo y vivo.',
    gardenEcology: {
      seeksInGarden: 'Humedad, sombra bajo macetas y hojarasca para reciclar en tierra fértil.',
      preferredFlowers: 'No busca flores; vive debajo de canteros con mantillo y pilas de compost.',
      preferredFruitTrees: 'Aprovecha hojas caídas y frutas pasadas al pie de frutales y árboles.',
      insectsOrFoodEaten: 'No come insectos; consume hojas secas, restos vegetales y madera en descomposición.',
    },
    identificationTraits:
      'Placas dorsales gris plomo o pardo oscuro levemente brillantes, muchas patitas cortas y antenas finas; se pliega en bolita cerrada.',
    typicalBehavior:
      'Prefiere lugares frescos, sombreados y húmedos; sale sobre todo al atardecer o después de la lluvia.',
    dietAndHabitat:
      'Vive en compost, debajo de troncos, macetas y bordes de canteros.',
    generalDistribution:
      'Muy común en jardines y parques de todo el país.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Patagonia', 'Cuyo', 'Litoral'],
  },

  // ============================================================================
  // FAUNA VECINA DEL JARDÍN (Reptiles, Anfibios, Mamíferos, Moluscos)
  // ============================================================================
  {
    taxonId: 'sp_teius_oculatus',
    organismGroup: 'fauna_vecina',
    scientificName: 'Teius oculatus',
    commonNameAr: 'Lagartija verde de jardín',
    alternativeNames: ['Lagartija común', 'Lagartija verde', 'Teiu'],
    family: 'Teiidae (Teídos)',
    quickSummary: 'Lagartija veloz de dorso verde brillante con líneas claras longitudinales y manchas oscuras en los flancos.',
    sizeLabel: '25–35 cm (con cola larga)',
    habitatTag: 'Jardines soleados, muros de piedra y canteros',
    dietTag: 'Insectos, arañas, grillos y escarabajos',
    ecologicalRole: 'Controladora natural de insectos del suelo en días soleados',
    coexistenceNote: 'Inofensiva y tímida; corre a refugiarse apenas te acercás. Conviene cuidar que perros o gatos no la lastimen.',
    gardenEcology: {
      seeksInGarden: 'Piedras o muros soleados para tomar calor y refugios entre plantas para cazar insectos.',
      preferredFlowers: 'Canteros con plantas bajas y arbustos donde resguardarse y encontrar insectos.',
      preferredFruitTrees: 'Ocasionalmente prueba frutos dulces caídos; principalmente recorre suelo y cercos.',
      insectsOrFoodEaten: 'Come grillos, arañas, escarabajos, hormigas, langostas y larvas del césped.',
    },
    identificationTraits:
      'Cabeza fina, dorso verde esmeralda a oliva con bandas claras a los lados y cola muy larga y esbelta.',
    typicalBehavior:
      'Toma sol en horas cálidas sobre piedras o pasto corto y patrulla ágilmente buscando insectos.',
    dietAndHabitat:
      'Habita pastizales, huertas y jardines amplios con refugios entre piedras o arbustos.',
    generalDistribution:
      'Centro, litoral y región pampeana de Argentina.',
    typicalRegionsAr: ['Buenos Aires', 'Entre Ríos', 'Santa Fe', 'Córdoba', 'Corrientes', 'La Pampa'],
  },
  {
    taxonId: 'sp_salvator_merianae',
    organismGroup: 'fauna_vecina',
    scientificName: 'Salvator merianae',
    commonNameAr: 'Lagarto overo',
    alternativeNames: ['Lagarto overo', 'Iguana overa', 'Teyú'],
    family: 'Teiidae (Teídos)',
    quickSummary: 'Gran lagarto nativo negro y blanco moteado (los juveniles tienen la cabeza verde esmeralda) de paso tranquilo.',
    sizeLabel: '60–110 cm (juveniles 25–40 cm)',
    habitatTag: 'Parques, jardines periurbanos, quintas y riberas',
    dietTag: 'Omnívoro (insectos, frutos, caracoles, roedores)',
    ecologicalRole: 'Especie nativa clave que dispersa semillas y regula roedores e insectos',
    coexistenceNote: 'Fauna silvestre protegida. No busca atacar; observarlo a distancia respetuosa sin acorralarlo ni tocarlo.',
    gardenEcology: {
      seeksInGarden: 'Sol matinal, agua, frutos caídos y presas como caracoles, insectos grandes y roedores.',
      preferredFlowers: 'Recorre bordes de cercos, pastizales y zonas con cobertura vegetal tranquila.',
      preferredFruitTrees: 'Higuera, morera, ciruelo, duraznero y frutales con frutos maduros caídos en el suelo.',
      insectsOrFoodEaten: 'Come caracoles, grillos, cascarudos, langostas, frutos dulces, huevos y pequeños roedores.',
    },
    identificationTraits:
      'Cuerpo robusto con bandas transversales oscuras y manchas blancas; lengua bífida larga con la que olfatea el entorno.',
    typicalBehavior:
      'Diurno y termorregulador: se asolea en la mañana y recorre lentamente cercos y riberas; hiberna en los meses fríos.',
    dietAndHabitat:
      'Frecuente en barrios arbolados, Delta, reservas y zonas rurales cerca de agua o pastizales.',
    generalDistribution:
      'Centro, norte y litoral argentino.',
    typicalRegionsAr: ['Buenos Aires', 'Entre Ríos', 'Santa Fe', 'Córdoba', 'Corrientes', 'Misiones'],
  },
  {
    taxonId: 'sp_hemidactylus_mabouia',
    organismGroup: 'fauna_vecina',
    scientificName: 'Hemidactylus mabouia',
    commonNameAr: 'Geko casero',
    alternativeNames: ['Geko', 'Salamanquesa', 'Lagartija nocturna'],
    family: 'Gekkonidae (Gecónidos)',
    quickSummary: 'Pequeña lagartija nocturna translúcida beige o grisácea con ojos grandes y deditos adhesivos que camina por las paredes.',
    sizeLabel: '9–13 cm · Pequeño',
    habitatTag: 'Paredes, galerías y alrededores de luces exteriores',
    dietTag: 'Mosquitos, polillas, cucarachitas y moscas',
    ecologicalRole: 'Excelente cazador nocturno de mosquitos e insectos en galerías',
    coexistenceNote: '100% inofensivo (no es venenoso ni muerde). Un vecino silencioso y sumamente útil en noches de verano.',
    gardenEcology: {
      seeksInGarden: 'Luces exteriores y galerías donde se reúnen mosquitos y polillas al anochecer.',
      preferredFlowers: 'No busca flores; prefiere paredes, pérgolas y marcos de ventanas.',
      preferredFruitTrees: 'No busca frutales; vive en grietas y techos de patios y galerías.',
      insectsOrFoodEaten: 'Caza mosquitos, polillas, moscas, arañitas y cucarachitas nocturnas.',
    },
    identificationTraits:
      'Piel suave semi-translúcida beige con tenues bandas oscuras, grandes ojos sin párpados con pupila vertical y dedos ensanchados.',
    typicalBehavior:
      'Aparece al anochecer cerca de lámparas encendidas aguardando polillas y mosquitos; suele emitir un chasquido suave.',
    dietAndHabitat:
      'Frecuente en paredes exteriores, pérgolas, marcos de ventanas y patios cálidos.',
    generalDistribution:
      'Muy extendido en áreas urbanas del norte, litoral y centro de Argentina.',
    typicalRegionsAr: ['Buenos Aires', 'Santa Fe', 'Córdoba', 'Entre Ríos', 'Misiones', 'Tucumán'],
  },
  {
    taxonId: 'sp_rhinella_arenarum',
    organismGroup: 'fauna_vecina',
    scientificName: 'Rhinella arenarum',
    commonNameAr: 'Sapo común',
    alternativeNames: ['Sapo argentino', 'Sapo de jardín'],
    family: 'Bufonidae (Bufónidos)',
    quickSummary: 'Anfibio terrestre robusto de piel rugosa pardo grisácea o verdosa y glándulas prominentes detrás de los ojos.',
    sizeLabel: '8–12 cm · Mediano',
    habitatTag: 'Jardines húmedos, patios nocturnos y canteros',
    dietTag: 'Babosas, caracoles, grillos, hormigas y escarabajos',
    ecologicalRole: 'Protector nocturno del jardín: regula insectos, babosas y escorpiones',
    coexistenceNote: 'Inofensivo para las personas (solo lavarse las manos si se lo toca y evitar que mascotas lo muerdan).',
    gardenEcology: {
      seeksInGarden: 'Refugios frescos y húmedos de día, agua sin cloro e insectos nocturnos debajo de las luces.',
      preferredFlowers: 'Canteros sombreados con helechos, calas, macetas bajas y tierra húmeda.',
      preferredFruitTrees: 'Recorre la base húmeda de árboles y huertas buscando babosas e insectos.',
      insectsOrFoodEaten: 'Devora babosas, caracoles, grillos, hormigas, cascarudos, cucarachas y alacranes.',
    },
    identificationTraits:
      'Cuerpo rechoncho con verrugas suaves, tonos tierra/oliva y ojos dorados con pupila horizontal.',
    typicalBehavior:
      'Sale al caer el sol o tras la lluvia a cazar debajo de las luces del jardín; durante el día descansa en lugares frescos.',
    dietAndHabitat:
      'Se beneficia de patios con refugios de tierra húmeda, plantas bajas y un platito con agua limpia sin cloro.',
    generalDistribution:
      'Presente en casi toda la Argentina desde el norte hasta Chubut.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Cuyo', 'Litoral', 'Patagonia'],
  },
  {
    taxonId: 'sp_boana_pulchella',
    organismGroup: 'fauna_vecina',
    scientificName: 'Boana pulchella',
    commonNameAr: 'Ranita trepadora del zarzal',
    alternativeNames: ['Ranita del zarzal', 'Rana verde de jardín', 'Ranita criolla'],
    family: 'Hylidae (Hílidos)',
    quickSummary: 'Pequeña rana esbelta verde lima o beige con fina línea lateral clara y ventosas en los dedos para trepar hojas.',
    sizeLabel: '3,5–5 cm · Pequeña',
    habitatTag: 'Plantas cerca de estanques, piletas y cañaverales',
    dietTag: 'Mosquitos, jejenes y pequeños insectos nocturnos',
    ecologicalRole: 'Indicadora de buena calidad ambiental y gran cazadora de mosquitos',
    coexistenceNote: 'Completamente inofensiva. Su canto nocturno como campanitas o golpecitos metálicos llena de vida las noches templadas.',
    gardenEcology: {
      seeksInGarden: 'Hojas anchas húmedas donde descansar de día, estanques y mosquitos para cazar de noche.',
      preferredFlowers: 'Calas, achiras, orejas de elefante, bromelias y plantas acuáticas de hoja ancha.',
      preferredFruitTrees: 'No busca frutales; prefiere vegetación húmeda cerca de fuentes o estanques.',
      insectsOrFoodEaten: 'Come mosquitos, jejenes, polillas pequeñas, moscas y arañitas nocturnas.',
    },
    identificationTraits:
      'Piel lisa que cambia entre verde brillante y pardo claro según temperatura/camuflaje, con banda lateral blanca y oscura.',
    typicalBehavior:
      'Descansa de día pegada a hojas anchas (como calas o achiras) y canta con entusiasmo en noches húmedas.',
    dietAndHabitat:
      'Prefiere jardines con plantas de hoja ancha, estanques o humedad cercana.',
    generalDistribution:
      'Centro, litoral, provincia de Buenos Aires y sierras de Córdoba.',
    typicalRegionsAr: ['Buenos Aires', 'Entre Ríos', 'Santa Fe', 'Córdoba', 'Corrientes'],
  },
  {
    taxonId: 'sp_didelphis_albiventris',
    organismGroup: 'fauna_vecina',
    scientificName: 'Didelphis albiventris',
    commonNameAr: 'Comadreja overa',
    alternativeNames: ['Comadreja', 'Zarigüeya', 'Micuré'],
    family: 'Didelphidae (Marsupiales)',
    quickSummary: 'Marsupial nativo nocturno de cara blanca con antifaz negro, orejas redondas bicolores y cola prensil.',
    sizeLabel: '30–45 cm (sin cola)',
    habitatTag: 'Arboledas, medianeras arboladas y parques nocturnos',
    dietTag: 'Omnívora: frutos, insectos, caracoles, alacranes y roedores',
    ecologicalRole: 'Marsupial nativo beneficioso que controla garrapatas, roedores e insectos',
    coexistenceNote: 'Fauna nativa valiosa (NO es una rata ni transmite rabia con facilidad). Dejarla seguir su camino tranquila y resguardar mascotas de noche.',
    gardenEcology: {
      seeksInGarden: 'Frutas maduras en árboles o en el suelo, refugio en copas altas e insectos nocturnos.',
      preferredFlowers: 'Enredaderas densas y arbustos altos como pasillo nocturno por medianeras.',
      preferredFruitTrees: 'Higuera, níspero, morera, ciruelo, duraznero, palta y cítricos dulces.',
      insectsOrFoodEaten: 'Come garrapatas, alacranes, cucarachas, caracoles, frutos maduros y pequeños roedores.',
    },
    identificationTraits:
      'Pelaje grisáceo desmechado, rostro blanco triangular con franja negra en la frente y ojos, y larga cola prensil parcialmente rosada.',
    typicalBehavior:
      'Silenciosa y nocturna; trepa árboles y tapiales con agilidad, y en primavera lleva a sus crías sobre el lomo.',
    dietAndHabitat:
      'Vive de manera inadvertida en árboles grandes y patios arbolados de pueblos y ciudades.',
    generalDistribution:
      'Amplísima distribución desde el norte hasta el norte de la Patagonia.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Cuyo', 'Noroeste'],
  },
  {
    taxonId: 'sp_cornu_aspersum',
    organismGroup: 'fauna_vecina',
    scientificName: 'Cornu aspersum',
    commonNameAr: 'Caracol de jardín',
    alternativeNames: ['Caracol común', 'Caracol de tierra'],
    family: 'Helicidae (Moluscos terrestres)',
    quickSummary: 'Molusco terrestre con caparazón espiralado pardo jaspeado y dos pares de tentáculos retráctiles.',
    sizeLabel: '2,5–3,5 cm de concha',
    habitatTag: 'Canteros húmedos, macetas y cercos tras la lluvia',
    dietTag: 'Hojas tiernas, brotes y materia vegetal',
    ecologicalRole: 'Descomponedor y parte de la cadena trófica de aves y sapos del jardín',
    coexistenceNote: 'Totalmente inofensivo. Sale después de la lluvia; si visita la huerta, se puede reubicar suavemente a mano.',
    gardenEcology: {
      seeksInGarden: 'Humedad nocturna o tras la lluvia, brotes tiernos y calcio de la tierra o muros.',
      preferredFlowers: 'Plantas de hoja tierna, dalias, hostas, calas y brotes de huerta.',
      preferredFruitTrees: 'Ocasionalmente sube a cítricos o frutales en noches muy húmedas.',
      insectsOrFoodEaten: 'No come insectos; se alimenta de hojas tiernas, hongos y materia vegetal blanda.',
    },
    identificationTraits:
      'Concha globosa en espiral con bandas pardas y crema, cuerpo blando grisáceo y tentáculos oculares largos.',
    typicalBehavior:
      'Se desplaza lentamente de noche o con lluvia y se encierra en su caparazón en épocas secas o frías.',
    dietAndHabitat:
      'Muy habitual en jardines sombreados, enredaderas y debajo de macetas húmedas.',
    generalDistribution:
      'Presente en casi todas las áreas urbanas y templadas de la Argentina.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Patagonia', 'Cuyo', 'Litoral'],
  },
];
