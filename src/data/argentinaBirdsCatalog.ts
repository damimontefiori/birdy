import { OrganismGroup, SpeciesCatalogEntry } from '../types/domain';
import { BIOMA_FAUNA_EXTRAS } from './biomaFaunaExtras';

/**
 * Catálogo taxonómico de aves frecuentes de Argentina (referencia eBird es_AR).
 * Se combina con mariposas, abejas, abejorros, insectos, arácnidos y fauna vecina en BIOMA_ARGENTINA_CATALOG.
 */
const RAW_ARGENTINA_BIRDS_CATALOG: SpeciesCatalogEntry[] = [
  {
    taxonId: 'houwre',
    scientificName: 'Troglodytes aedon',
    commonNameAr: 'Ratona común',
    alternativeNames: ['Ratucha', 'Ratoncita', 'Tacuarita', 'Curucucha'],
    family: 'Troglodytidae (Troglodítidos)',
    quickSummary: 'Muy pequeña, parda acanelada con fina barrita oscura en alas y cola, que suele llevar levantada.',
    sizeLabel: '11–12 cm · Muy pequeña',
    habitatTag: 'Jardines, patios y arbustos',
    dietTag: 'Insectos y arañitas',
    identificationTraits:
      'Plumaje pardo ocráceo suave con fino barrado oscuro en alas y cola. Pico fino y agudo de insectívoro; suele mantener la cola corta erguida.',
    typicalBehavior:
      'Muy inquieta y curiosa; recorre enredaderas, cercos y huecos de paredes con un canto sorprendentemente fuerte y burbujeante.',
    dietAndHabitat:
      'Busca arañas, orugas e insectos pequeños en rincones, ramas bajas y macetas. Muy habitual en jardines y patios.',
    generalDistribution:
      'Presente en todo el territorio argentino, desde el norte hasta Tierra del Fuego.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Patagonia', 'Cuyo', 'Litoral', 'Noroeste'],
  },
  {
    taxonId: 'rufhor2',
    scientificName: 'Furnarius rufus',
    commonNameAr: 'Hornero común',
    alternativeNames: ['Hornero', 'Casero', 'Alonso'],
    family: 'Furnariidae (Furnáridos)',
    quickSummary: 'Pardo rojizo uniforme, garganta clara y pico fino levemente curvo; camina confiado por el césped.',
    sizeLabel: '18–20 cm · Mediana',
    habitatTag: 'Jardines, plazas y campos',
    dietTag: 'Insectos y lombrices',
    identificationTraits:
      'Dorso y cola pardo rojizo (rufo) uniforme, pecho claro, pico esbelto levemente curvado y patas largas grisáceas.',
    typicalBehavior:
      'Caminador terrícola muy confiado. Construye en pareja su nido de barro con forma de horno y canta a dúo batiendo las alas.',
    dietAndHabitat:
      'Consume insectos, lombrices y larvas picoteando el suelo húmedo. Frecuenta jardines urbanos, parques y áreas rurales.',
    generalDistribution:
      'Ave Nacional de la Argentina. Muy común en el centro, norte y litoral, en expansión hacia la Patagonia norte.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Misiones', 'Corrientes', 'La Pampa'],
    defaultMuralPlate: '/plates/mural_hornero.jpg',
    defaultWatercolorPlate: '/plates/acuarela_hornero.jpg',
    defaultGraphitePlate: '/plates/grafito_hornero.jpg',
  },
  {
    taxonId: 'rucspa1',
    scientificName: 'Zonotrichia capensis',
    commonNameAr: 'Chingolo',
    alternativeNames: ['Chingolito', 'Cachilo'],
    family: 'Passerellidae (Paserélidos)',
    quickSummary: 'Pequeño con semicopete gris rayado de negro y collar canela rojizo inconfundible en la nuca.',
    sizeLabel: '14–15 cm · Pequeña',
    habitatTag: 'Jardines, parques y pastizales',
    dietTag: 'Semillas e insectos',
    identificationTraits:
      'Semicopete gris estriado de negro que suele erizar, mejillas grises enmarcadas y collar canela rojizo en la nuca.',
    typicalBehavior:
      'Da saltitos en el suelo buscando semillas. Su canto claro de silbidos con trino final suena desde el amanecer.',
    dietAndHabitat:
      'Semillas de pastos, frutos pequeños e insectos. Presente en jardines, parques, sierras y bosques abiertos.',
    generalDistribution:
      'Habita todas las provincias de la Argentina, desde la Puna hasta Tierra del Fuego.',
    typicalRegionsAr: ['Buenos Aires', 'Patagonia', 'Cuyo', 'Noroeste', 'Centro', 'Litoral'],
    defaultWatercolorPlate: '/plates/acuarela_chingolo.jpg',
    defaultGraphitePlate: '/plates/grafito_chingolo.jpg',
  },
  {
    taxonId: 'grekis',
    scientificName: 'Pitangus sulphuratus',
    commonNameAr: 'Benteveo común',
    alternativeNames: ['Bichofeo', 'Benteveo', 'Queteví'],
    family: 'Tyrannidae (Tiránidos)',
    quickSummary: 'Pecho amarillo vivo, cabeza negra con ancha vincha blanca y pico robusto; grita «¡bichofeo!».',
    sizeLabel: '22–24 cm · Mediana',
    habitatTag: 'Jardines, arboledas y riberas',
    dietTag: 'Omnívora (insectos, frutos, peces)',
    identificationTraits:
      'Vientre amarillo brillante, dorso pardo, antifaz negro con ceja blanca ancha (corona amarilla semioculta) y pico recto fuerte.',
    typicalBehavior:
      'Audaz, vocal y territorial. Vigila desde cables o ramas altas y suele zambullirse sobre estanques o piletas.',
    dietAndHabitat:
      'Insectos al vuelo, lombrices, peces pequeños y frutos. Muy adaptable a jardines urbanos y costas.',
    generalDistribution:
      'Abundante en todo el norte, centro, Cuyo y litoral argentino hasta el norte patagónico.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Entre Ríos', 'Tucumán'],
    defaultWatercolorPlate: '/plates/acuarela_benteveo.jpg',
    defaultGraphitePlate: '/plates/grafito_benteveo.jpg',
  },
  {
    taxonId: 'rubthr1',
    scientificName: 'Turdus rufiventris',
    commonNameAr: 'Zorzal colorado',
    alternativeNames: ['Zorzal común', 'Chalchalero colorado'],
    family: 'Turdidae (Túrdidos)',
    quickSummary: 'Vientre anaranjado ladrillo, dorso pardo oliváceo, garganta estriada y anillo ocular amarillo.',
    sizeLabel: '23–25 cm · Mediana',
    habitatTag: 'Jardines arbolados y parques',
    dietTag: 'Lombrices, frutos e insectos',
    identificationTraits:
      'Dorso pardo oliváceo, garganta clara con finas estrías oscuras, vientre rufo anaranjado y pico amarillento.',
    typicalBehavior:
      'Corre tramos cortos por el césped y se detiene erguido para buscar lombrices. Canto aflautado muy melodioso al alba.',
    dietAndHabitat:
      'Lombrices, insectos y frutos carnosos. Muy frecuente en parques sombreados y jardines con árboles.',
    generalDistribution:
      'Norte, litoral y centro del país hasta Buenos Aires y La Pampa.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Litoral', 'Noroeste'],
    defaultWatercolorPlate: '/plates/acuarela_zorzal.jpg',
  },
  {
    taxonId: 'chbmoc1',
    scientificName: 'Mimus saturninus',
    commonNameAr: 'Calandria grande',
    alternativeNames: ['Calandria común', 'Calandria'],
    family: 'Mimidae (Mímidos)',
    quickSummary: 'Gris pardusca y esbelta, con ceja blanca bien marcada y cola muy larga con puntas blancas.',
    sizeLabel: '25–27 cm · Mediana',
    habitatTag: 'Jardines, plazas y campos',
    dietTag: 'Insectos, frutos y bayas',
    identificationTraits:
      'Dorso gris pardo, ancha ceja blanca sobre línea ocular oscura, pecho blanquecino y cola larga oscura con ápices blancos.',
    typicalBehavior:
      'Excelente cantora e imitadora de otras aves. Corre por el pasto o se posa en lo alto levantando la cola.',
    dietAndHabitat:
      'Insectos del suelo y frutos de árboles y arbustos. Muy común en parques, veredas arboladas y estancias.',
    generalDistribution:
      'Amplia presencia en el norte, litoral y centro de la Argentina hasta Río Negro.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'La Pampa', 'Litoral'],
  },
  {
    taxonId: 'patmock1',
    scientificName: 'Mimus patagonicus',
    commonNameAr: 'Calandria mora',
    alternativeNames: ['Calandria patagónica'],
    family: 'Mimidae (Mímidos)',
    quickSummary: 'Gris pardusca de flancos acanelados, ceja blanca definida y cola larga con borde blanco.',
    sizeLabel: '22–24 cm · Mediana',
    habitatTag: 'Estepa y claros patagónicos',
    dietTag: 'Insectos y frutos silvestres',
    identificationTraits:
      'Plumaje gris pardusco más compacto que la calandria grande, ceja clara, flancos suavemente canelas y cola oscura con puntas blancas.',
    typicalBehavior:
      'Curiosa y gran imitadora de cantos. Se posa en la punta de arbustos balanceando la cola.',
    dietAndHabitat:
      'Invertebrados y bayas nativas (calafate, maqui). Típica de jardines cordilleranos y estepa.',
    generalDistribution:
      'Toda la Patagonia y región cordillerana, migrando parcialmente hacia el centro en invierno.',
    typicalRegionsAr: ['Lago Puelo', 'Bariloche', 'Chubut', 'Río Negro', 'Neuquén', 'Santa Cruz'],
  },
  {
    taxonId: 'saytan1',
    scientificName: 'Thraupis sayaca',
    commonNameAr: 'Celestino común',
    alternativeNames: ['Chogüí', 'Celestino'],
    family: 'Thraupidae (Tráupidos)',
    quickSummary: 'Gris celeste suave en todo el cuerpo con alas y cola azul turquesa; asiduo de árboles frutales.',
    sizeLabel: '16–18 cm · Pequeña',
    habitatTag: 'Copas de árboles y frutales',
    dietTag: 'Frutos, néctar e insectos',
    identificationTraits:
      'Plumaje gris azulado celeste uniforme, con bordes de alas y cola azul turquesa brillante y pico cónico corto.',
    typicalBehavior:
      'Activo en parejas o pequeños grupos en las copas, emitiendo silbidos agudos mientras recorre el follaje.',
    dietAndHabitat:
      'Frugívoro (higos, moras, nísperos, cítricos) y pétalos tiernos. Frecuenta jardines arbolados.',
    generalDistribution:
      'Norte, litoral y centro hasta el noreste y centro de Buenos Aires.',
    typicalRegionsAr: ['Buenos Aires', 'Entre Ríos', 'Corrientes', 'Misiones', 'Santa Fe', 'Córdoba'],
  },
  {
    taxonId: 'redcre1',
    scientificName: 'Paroaria coronata',
    commonNameAr: 'Cardenal común',
    alternativeNames: ['Cardenal de copete rojo', 'Cardenal'],
    family: 'Thraupidae (Tráupidos)',
    quickSummary: 'Inconfundible copete erguido, cabeza y babero rojo escarlata con pecho blanco y dorso gris.',
    sizeLabel: '18–19 cm · Mediana',
    habitatTag: 'Montes abiertos y parques',
    dietTag: 'Semillas e insectos',
    identificationTraits:
      'Copete puntiagudo, cara y garganta rojo vivo, pecho y vientre blancos puros, dorso gris plomizo y pico claro.',
    typicalBehavior:
      'Anda en parejas bajando al suelo despejado. Canto potente, pausado y musical desde ramas expuestas.',
    dietAndHabitat:
      'Semillas, brotes tiernos y pequeños insectos. Habita espinales, parques y jardines suburbanos.',
    generalDistribution:
      'Norte y centro de la Argentina hasta el norte de la Patagonia.',
    typicalRegionsAr: ['Buenos Aires', 'Entre Ríos', 'Córdoba', 'La Pampa', 'Santa Fe', 'Corrientes'],
  },
  {
    taxonId: 'glbem1',
    scientificName: 'Chlorostilbon lucidus',
    commonNameAr: 'Picaflor común',
    alternativeNames: ['Picaflor verde', 'Colibrí común'],
    family: 'Trochilidae (Troquílidos)',
    quickSummary: 'Diminuto verde esmeralda iridiscente con pico rojo coral de punta negra; planea frente a las flores.',
    sizeLabel: '8–9 cm · Diminuta',
    habitatTag: 'Jardines con flores y parques',
    dietTag: 'Néctar y pequeños insectos',
    identificationTraits:
      'Macho verde brillante con reflejos azulados en garganta y pico rojo con ápice negro; hembra con vientre grisáceo y ceja blanca.',
    typicalBehavior:
      'Vuelo suspendido rapidísimo y territorial junto a flores tubulares como salvias, hibiscos o lantanas.',
    dietAndHabitat:
      'Néctar floral y diminutos artrópodos al vuelo. Muy frecuente en patios y balcones con flores.',
    generalDistribution:
      'Amplia distribución en el norte y centro argentino hasta Río Negro.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Mendoza', 'Noroeste'],
  },
  {
    taxonId: 'gilhum1',
    scientificName: 'Hylocharis chrysura',
    commonNameAr: 'Picaflor bronceado',
    alternativeNames: ['Picaflor dorado', 'Colibrí bronceado'],
    family: 'Trochilidae (Troquílidos)',
    quickSummary: 'Verde dorado con cola cobriza brillante, mentón canela y pico rojo coral de punta oscura.',
    sizeLabel: '9–10 cm · Diminuta',
    habitatTag: 'Jardines arbolados y montes',
    dietTag: 'Néctar e insectos diminutos',
    identificationTraits:
      'Plumaje verde bronceado iridiscente en ambos sexos, cola rojo-dorada llamativa y pico rojo largo con punta negra.',
    typicalBehavior:
      'Muy activo en enredaderas y árboles en flor (ceibos, jacarandás, lapachos), emitiendo chasquidos agudos.',
    dietAndHabitat:
      'Néctar y pequeños insectos en jardines con vegetación abundante y bosques ribereños.',
    generalDistribution:
      'Norte, litoral y este del país hasta el noreste de Buenos Aires.',
    typicalRegionsAr: ['Buenos Aires', 'Entre Ríos', 'Corrientes', 'Misiones', 'Santa Fe', 'Córdoba'],
  },
  {
    taxonId: 'houspa',
    scientificName: 'Passer domesticus',
    commonNameAr: 'Gorrión',
    alternativeNames: ['Gorrión común'],
    family: 'Passeridae (Paséridos)',
    quickSummary: 'Compacto y pardo; el macho luce babero negro, mejillas blancas y corona gris con nuca castaña.',
    sizeLabel: '14–15 cm · Pequeña',
    habitatTag: 'Ciudades, patios y plazas',
    dietTag: 'Semillas, migas e insectos',
    identificationTraits:
      'Macho con garganta negra, corona gris y dorso castaño estriado; hembra parda grisácea con ceja clara sin copete ni collar canela.',
    typicalBehavior:
      'Gregario, bullicioso y urbano; se baña en polvo o charcos y anida en aleros y huecos de edificios.',
    dietAndHabitat:
      'Semillas, granos, restos urbanos e insectos para sus pichones. Presente en casi toda área poblada.',
    generalDistribution:
      'Introducido y establecido en prácticamente todo el país.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Patagonia', 'Noroeste'],
  },
  {
    taxonId: 'eardov1',
    scientificName: 'Zenaida auriculata',
    commonNameAr: 'Torcaza común',
    alternativeNames: ['Torcaza', 'Palomita mediana'],
    family: 'Columbidae (Colúmbidos)',
    quickSummary: 'Paloma esbelta gris-pardusca con dos manchitas negras detrás del ojo y lunares oscuros en las alas.',
    sizeLabel: '24–26 cm · Mediana',
    habitatTag: 'Plazas, jardines y campos',
    dietTag: 'Semillas y granos',
    identificationTraits:
      'Pecho rosado vinoso suave, dos trazos negros en la mejilla, manchas negras en las alas y cola en cuña con puntas blancas.',
    typicalBehavior:
      'Vuelo ágil y directo; su arrullo suave y repetido acompaña las tardes en parques y arboledas.',
    dietAndHabitat:
      'Se alimenta en el suelo buscando semillas y brotes. Muy común en ciudades, jardines y campos.',
    generalDistribution:
      'Todo el territorio argentino continental.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Patagonia', 'Noroeste'],
  },
  {
    taxonId: 'picpig2',
    scientificName: 'Patagioenas picazuro',
    commonNameAr: 'Paloma picazuró',
    alternativeNames: ['Picazuró', 'Paloma turca', 'Paloma de monte'],
    family: 'Columbidae (Colúmbidos)',
    quickSummary: 'Grande y robusta, gris vinosa con cuello escamado tornasolado y una franja blanca visible en el ala.',
    sizeLabel: '34–36 cm · Grande',
    habitatTag: 'Arboledas, parques y montes',
    dietTag: 'Frutos, brotes y semillas',
    identificationTraits:
      'Cuerpo robusto gris vinoso, collar posterior finamente escamado de negro y blanco, y filete blanco nítido en el borde del ala.',
    typicalBehavior:
      'Vuelo potente con aleteo sonoro; emite un canto grave de cuatro notas («cu-cu-rú-cu») desde lo alto de los árboles.',
    dietAndHabitat:
      'Semillas, frutos de árboles y brotes tiernos. Frecuente en plazas arboladas, barrios con parque y montes.',
    generalDistribution:
      'Norte, litoral y centro de la Argentina, extendiéndose hacia el sur bonaerense y norte patagónico.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'La Pampa', 'Litoral'],
  },
  {
    taxonId: 'monpar',
    scientificName: 'Myiopsitta monachus',
    commonNameAr: 'Cotorra común',
    alternativeNames: ['Cotorra argentina', 'Cata'],
    family: 'Psittacidae (Psitácidos)',
    quickSummary: 'Loro verde luminoso con frente, mejillas y pecho gris claro escamado y cola larga puntiaguda.',
    sizeLabel: '28–30 cm · Mediana',
    habitatTag: 'Parques, palmeras y montes',
    dietTag: 'Frutos, semillas y flores',
    identificationTraits:
      'Plumaje verde brillante con alas de puntas azuladas, cara y pecho gris perla y pico curvo color cuerno.',
    typicalBehavior:
      'Muy sociable y ruidosa; construye enormes nidos comunales de ramitas en árboles altos o palmeras.',
    dietAndHabitat:
      'Frutos, semillas, brotes y flores en bandadas ruidosas. Muy habitual en parques y zonas rurales.',
    generalDistribution:
      'Centro, norte y litoral del país hasta el norte de la Patagonia.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'La Pampa', 'Mendoza'],
  },
  {
    taxonId: 'soulap1',
    scientificName: 'Vanellus chilensis',
    commonNameAr: 'Tero común',
    alternativeNames: ['Tero', 'Teru-teru'],
    family: 'Charadriidae (Carádridos)',
    quickSummary: 'Zancuda elegante gris, blanca y negra, con copete fino en la nuca, ojos y patas rosado-rojizos.',
    sizeLabel: '35–37 cm · Grande',
    habitatTag: 'Campos, parques y lagunas',
    dietTag: 'Insectos, lombrices y larvas',
    identificationTraits:
      'Frente y pecho negros, dorso gris con brillo broncíneo en el hombro, fino penacho occipital y patas largas rosadas.',
    typicalBehavior:
      'Vigilante y protector de su nido en el suelo; alerta a todo el entorno con su clásico grito «¡teru-teru!».',
    dietAndHabitat:
      'Insectos y pequeños invertebrados en pastos cortos, plazas amplias, bordes de lagunas y campos.',
    generalDistribution:
      'Presente en casi todo el país, de norte a sur.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Patagonia', 'Litoral', 'La Pampa'],
  },
  {
    taxonId: 'chimango1',
    scientificName: 'Milvago chimango',
    commonNameAr: 'Chimango',
    alternativeNames: ['Caranchillo', 'Tiuque'],
    family: 'Falconidae (Falcónidos)',
    quickSummary: 'Rapaz mediana pardo acanelada, muy confiada, con mancha clara en las alas al volar.',
    sizeLabel: '37–40 cm · Grande',
    habitatTag: 'Parques, campos y costas',
    dietTag: 'Omnívora e insectívora',
    identificationTraits:
      'Plumaje pardo canela con vientre jaspeado claro, mancha pálida en la base de las primarias en vuelo y patas gris-amarillentas.',
    typicalBehavior:
      'Inteligente y audaz; camina por el césped o planea en círculos emitiendo un grito áspero prolongado.',
    dietAndHabitat:
      'Insectos, gusanos, carroña y restos. Muy común en ambientes rurales, costas y valles patagónicos.',
    generalDistribution:
      'Casi todo el territorio argentino, especialmente abundante en la región pampeana y la Patagonia.',
    typicalRegionsAr: ['Buenos Aires', 'Patagonia', 'Lago Puelo', 'La Pampa', 'Córdoba'],
  },
  {
    taxonId: 'crecar1',
    scientificName: 'Caracara plancus',
    commonNameAr: 'Carancho',
    alternativeNames: ['Caracara', 'Traro'],
    family: 'Falconidae (Falcónidos)',
    quickSummary: 'Rapaz grande de corona negra, cara rojiza desnuda, cuello claro barrado y pico ganchudo azulado.',
    sizeLabel: '55–60 cm · Muy grande',
    habitatTag: 'Campos, sierras y parques',
    dietTag: 'Oportunista y carroñera',
    identificationTraits:
      'Boina negra eréctil, piel facial rojo-anaranjada, cuello y pecho crema finamente barrados y patas largas amarillas.',
    typicalBehavior:
      'Vuelo potente y porte majestuoso en postes o árboles altos; suele caminar confiado en espacios abiertos.',
    dietAndHabitat:
      'Invertebrados, carroña y pequeñas presas. Presente en llanuras, montañas, costas y áreas suburbanas.',
    generalDistribution:
      'Todo el territorio argentino continental y Tierra del Fuego.',
    typicalRegionsAr: ['Buenos Aires', 'Patagonia', 'Córdoba', 'Litoral', 'Noroeste', 'Cuyo'],
  },
  {
    taxonId: 'grbwoo1',
    scientificName: 'Colaptes melanochloros',
    commonNameAr: 'Carpintero real',
    alternativeNames: ['Carpintero real común'],
    family: 'Picidae (Pícidos)',
    quickSummary: 'Dorso barrado verdoso y negro, nuca rojo intenso, pecho amarillento moteado y mejilla blanca.',
    sizeLabel: '26–28 cm · Mediana',
    habitatTag: 'Arboledas, montes y parques',
    dietTag: 'Hormigas y larvas de madera',
    identificationTraits:
      'Corona negra, nuca roja (macho con bigote rojo), cara blanca, dorso barrado negro y verdoso y pecho crema con lunares negros.',
    typicalBehavior:
      'Trepa troncos verticalmente apoyado en su cola rígida y golpea la corteza buscando hormigas y larvas.',
    dietAndHabitat:
      'Hormigas, larvas de escarabajos y frutos. Frecuente en árboles añosos de parques y bosques.',
    generalDistribution:
      'Norte, litoral y centro del país hasta el norte de la Patagonia.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Misiones', 'La Pampa'],
  },
  {
    taxonId: 'camfli1',
    scientificName: 'Colaptes campestris',
    commonNameAr: 'Carpintero campestre',
    alternativeNames: ['Carpintero de campo'],
    family: 'Picidae (Pícidos)',
    quickSummary: 'Carpintero grande de garganta y pecho amarillo oro, corona negra y dorso barrado; suele andar en el suelo.',
    sizeLabel: '30–32 cm · Grande',
    habitatTag: 'Campos, parques y postes',
    dietTag: 'Hormigas y termitas',
    identificationTraits:
      'Corona y nuca negras, mejillas y pecho amarillo vivo, dorso pardo barrado de blanco y rabadilla blanca visible en vuelo.',
    typicalBehavior:
      'A diferencia de otros carpinteros, pasa mucho tiempo en el suelo buscando hormigueros en pequeños grupos.',
    dietAndHabitat:
      'Hormigas y termitas en pastizales, campos abiertos, parques amplios y arboledas ralas.',
    generalDistribution:
      'Norte, centro y este argentino hasta Río Negro.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'La Pampa', 'Corrientes'],
  },
  {
    taxonId: 'guicuc1',
    scientificName: 'Guira guira',
    commonNameAr: 'Pirincho',
    alternativeNames: ['Urraca argentina', 'Quililo'],
    family: 'Cuculidae (Cucúlidos)',
    quickSummary: 'Inconfundible copete despeinado rojizo, cuerpo crema estriado, pico anaranjado y cola muy larga con punta blanca.',
    sizeLabel: '38–40 cm · Grande',
    habitatTag: 'Jardines, campos y arboledas',
    dietTag: 'Insectos, lagartijas y ranas',
    identificationTraits:
      'Copete erizado castaño-rufo, ojo amarillo, pecho crema con finas rayas negras y cola larguísima blanca con ancha banda negra.',
    typicalBehavior:
      'Siempre en bandadas familiares; se acurrucan apretados en una misma rama para tomar sol por la mañana.',
    dietAndHabitat:
      'Langostas, escarabajos y pequeños vertebrados en jardines amplios, quintas y campos.',
    generalDistribution:
      'Norte, centro y este de la Argentina hasta Río Negro.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Corrientes', 'Tucumán'],
  },
  {
    taxonId: 'hoosis1',
    scientificName: 'Spinus magellanicus',
    commonNameAr: 'Cabecita negra común',
    alternativeNames: ['Cabecita negra', 'Jilguerito'],
    family: 'Fringillidae (Fringílidos)',
    quickSummary: 'Pequeño amarillo verdoso con banda amarilla en el ala negra; el macho tiene capuchón negro azabache.',
    sizeLabel: '11–12 cm · Muy pequeña',
    habitatTag: 'Jardines, cipreses y parques',
    dietTag: 'Semillas pequeñas y brotes',
    identificationTraits:
      'Macho con cabeza completamente negra, vientre amarillo brillante y alas negras con franja amarilla; hembra verdosa sin capuchón negro.',
    typicalBehavior:
      'Ágil y acrobático en bandaditas; se cuelga de flores secas o pinos emitiendo un canto continuo y alegre.',
    dietAndHabitat:
      'Semillas de cardos, dientes de león y árboles ornamentales en jardines, parques y bosques.',
    generalDistribution:
      'Prácticamente todo el territorio argentino.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Patagonia', 'Mendoza', 'Noroeste', 'Litoral'],
  },
  {
    taxonId: 'saffin',
    scientificName: 'Sicalis flaveola',
    commonNameAr: 'Jilguero dorado',
    alternativeNames: ['Jilguero', 'Botón de oro'],
    family: 'Thraupidae (Tráupidos)',
    quickSummary: 'Macho amarillo oro luminoso con frente anaranjada intensa; hembra y juveniles grisáceos estriados.',
    sizeLabel: '13–14 cm · Pequeña',
    habitatTag: 'Jardines, parques y pastizales',
    dietTag: 'Semillas e insectos',
    identificationTraits:
      'Macho adulto amarillo dorado con corona anaranjada; juveniles y hembras pardo-grisáceos rayados con tintes amarillos.',
    typicalBehavior:
      'Caminador y cantor entusiasta; aprovecha nidos abandonados de hornero para criar a sus pichones.',
    dietAndHabitat:
      'Semillas de gramíneas en el suelo. Habitual en parques, quintas, jardines y campos arbolados.',
    generalDistribution:
      'Norte, litoral y centro del país hasta el sur de Buenos Aires y La Pampa.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Corrientes', 'Noroeste'],
  },
  {
    taxonId: 'shicow',
    scientificName: 'Molothrus bonariensis',
    commonNameAr: 'Tordo renegrido',
    alternativeNames: ['Tordo común', 'Renegrido'],
    family: 'Icteridae (Ictéridos)',
    quickSummary: 'Macho negro brillante con reflejos azul-violáceos metálicos; hembra gris pardusca uniforme.',
    sizeLabel: '19–21 cm · Mediana',
    habitatTag: 'Plazas, jardines y campos',
    dietTag: 'Semillas e insectos',
    identificationTraits:
      'Pico cónico negro y agudo; macho negro violáceo tornasolado al sol; hembra enteramente gris parda sin marcas.',
    typicalBehavior:
      'Camina erguido en bandadas por el césped. No construye nido propio: pone huevos en nidos de chingolos y otras aves.',
    dietAndHabitat:
      'Semillas, granos e insectos. Muy abundante en jardines, plazas, quintas y zonas rurales.',
    generalDistribution:
      'Casi todo el territorio argentino hasta Santa Cruz.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Patagonia', 'Litoral'],
  },
  {
    taxonId: 'masgna1',
    scientificName: 'Polioptila dumicola',
    commonNameAr: 'Tacuarita azul',
    alternativeNames: ['Piojito azulado', 'Azulito'],
    family: 'Polioptilidae (Polioptílidos)',
    quickSummary: 'Diminuta gris azulada con cola larga negra bordeada de blanco; el macho luce un antifaz negro.',
    sizeLabel: '12 cm · Muy pequeña',
    habitatTag: 'Montes, parques y arbustos',
    dietTag: 'Insectos y larvas pequeñas',
    identificationTraits:
      'Plumaje gris celeste delicado, cola larga y angosta que agita constantemente; macho con antifaz negro, hembra con media luna oscura detrás del ojo.',
    typicalBehavior:
      'Muy inquieta en parejas entre ramas finas de árboles y arbustos, emitiendo un maullidito agudo.',
    dietAndHabitat:
      'Pequeños insectos del follaje en montes, reservas urbanas y jardines arbolados.',
    generalDistribution:
      'Norte, litoral y centro del país hasta el noreste de Buenos Aires y Córdoba.',
    typicalRegionsAr: ['Buenos Aires', 'Entre Ríos', 'Santa Fe', 'Córdoba', 'Corrientes', 'Misiones'],
  },
  {
    taxonId: 'verfly',
    scientificName: 'Pyrocephalus rubinus',
    commonNameAr: 'Churinche',
    alternativeNames: ['Brasita de fuego', 'Bola de fuego'],
    family: 'Tyrannidae (Tiránidos)',
    quickSummary: 'Macho con cabeza y pecho rojo escarlata encendido y dorso negro; hembra gris con vientre rosado estriado.',
    sizeLabel: '13–14 cm · Pequeña',
    habitatTag: 'Montes abiertos, quintas y riberas',
    dietTag: 'Insectos al vuelo',
    identificationTraits:
      'Macho inconfundible rojo bermellón con antifaz, espalda y cola pardo-negros; hembra gris pardusca con vientre rosado suave.',
    typicalBehavior:
      'Se posa en ramas expuestas o alambrados y hace vuelos acrobáticos cortos para atrapar insectos en primavera y verano.',
    dietAndHabitat:
      'Insectívoro aéreo. Llega al centro y sur en primavera-verano a parques arbolados, quintas y campos.',
    generalDistribution:
      'Norte y centro argentino en primavera-verano, llegando hasta Chubut.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Entre Ríos', 'La Pampa', 'Río Negro', 'Litoral'],
  },
  {
    taxonId: 'neocor',
    scientificName: 'Nannopterum brasilianum',
    commonNameAr: 'Biguá',
    alternativeNames: ['Cormorán negro', 'Biguá común'],
    family: 'Phalacrocoracidae (Falacrocorácidos)',
    quickSummary: 'Ave acuática grande y negra de cuello largo, pico ganchudo y suele secar las alas abiertas al sol.',
    sizeLabel: '70–75 cm · Muy grande',
    habitatTag: 'Ríos, lagunas y embalses',
    dietTag: 'Peces',
    identificationTraits:
      'Plumaje negro lustroso (juveniles pardos), bolsa gular amarillenta bordeada de blanco y pico fino ganchudo.',
    typicalBehavior:
      'Bucea largas distancias persiguiendo peces y luego se posa en ramas o muelles con las alas extendidas secándose.',
    dietAndHabitat:
      'Principalmente peces en ríos, arroyos, lagunas urbanas, embalses y costas.',
    generalDistribution:
      'En cuerpos de agua de todo el país.',
    typicalRegionsAr: ['Buenos Aires', 'Litoral', 'Córdoba', 'Patagonia', 'Noroeste'],
  },
  {
    taxonId: 'burowl',
    scientificName: 'Athene cunicularia',
    commonNameAr: 'Lechucita vizcachera',
    alternativeNames: ['Lechucita de las vizcacheras', 'Lechucita pampa'],
    family: 'Strigidae (Estrígidos)',
    quickSummary: 'Pequeña lechuza diurna de patas largas, ojos amarillos expresivos y plumaje pardo salpicado de blanco.',
    sizeLabel: '22–24 cm · Mediana',
    habitatTag: 'Campos, baldíos y costas',
    dietTag: 'Insectos y pequeños roedores',
    identificationTraits:
      'Cabeza redonda sin orejas, ojos grandes amarillo brillante, cejas blancas marcadas y patas largas finamente emplumadas.',
    typicalBehavior:
      'Activa de día junto a cuevas en el suelo o postes; hace reverencias rápidas cuando algo llama su atención.',
    dietAndHabitat:
      'Escarabajos, langostas y pequeños vertebrados en praderas, banquinas, campos y estepas.',
    generalDistribution:
      'Amplia presencia en toda la Argentina hasta el sur patagónico.',
    typicalRegionsAr: ['Buenos Aires', 'La Pampa', 'Córdoba', 'Patagonia', 'Cuyo', 'Litoral'],
  },
];

function inferDefaultBirdEcologicalRole(bird: SpeciesCatalogEntry): string {
  const diet = normalizeText(bird.dietTag || bird.dietAndHabitat || '');
  if (diet.includes('nectar')) {
    return 'Polinizador clave de flores tubulares e insectívoro delicado';
  }
  if (diet.includes('frut') && diet.includes('insect')) {
    return 'Dispersor de semillas y controlador natural de insectos del jardín';
  }
  if (diet.includes('semill')) {
    return 'Ave granívora e insectívora que enriquece la vida del jardín';
  }
  if (diet.includes('roedor')) {
    return 'Ave rapaz beneficiosa que regula roedores e insectos grandes';
  }
  return 'Controlador natural de insectos y visitante vivo del jardín';
}

export const ARGENTINA_BIRDS_CATALOG: SpeciesCatalogEntry[] = RAW_ARGENTINA_BIRDS_CATALOG.map(
  (bird) => ({
    ...bird,
    organismGroup: 'aves' as OrganismGroup,
    ecologicalRole: bird.ecologicalRole || inferDefaultBirdEcologicalRole(bird),
    coexistenceNote:
      bird.coexistenceNote ||
      'Inofensiva; ofrecer un bebedero con agua limpia, sombra y plantas nativas la invita a regresar.',
  })
);

/**
 * Catálogo completo de Bioma Argentina: aves, mariposas, abejas, abejorros,
 * insectos, arácnidos y fauna vecina que convive en jardines y áreas naturales.
 */
export const BIOMA_ARGENTINA_CATALOG: SpeciesCatalogEntry[] = [
  ...ARGENTINA_BIRDS_CATALOG,
  ...BIOMA_FAUNA_EXTRAS,
];

// Registro dinámico en memoria para especies descubiertas por IA o iNaturalist fuera del catálogo base
const dynamicSpeciesRegistry = new Map<string, SpeciesCatalogEntry>();

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const VALID_ORGANISM_GROUPS = new Set<OrganismGroup>([
  'aves',
  'mariposas',
  'abejas_abejorros',
  'insectos_aracnidos',
  'fauna_vecina',
]);

/**
 * Clasifica cualquier especie en uno de los 5 grupos de Bioma a partir de su taxonomía,
 * nombre común o nombre científico (compatible con iNaturalist y especies previas de aves).
 */
export function inferOrganismGroupFromMeta(meta: {
  organismGroup?: string | null;
  iconicTaxonName?: string | null;
  scientificName?: string | null;
  commonName?: string | null;
  family?: string | null;
}): OrganismGroup {
  if (meta.organismGroup && VALID_ORGANISM_GROUPS.has(meta.organismGroup as OrganismGroup)) {
    return meta.organismGroup as OrganismGroup;
  }

  const iconic = normalizeText(meta.iconicTaxonName || '');
  const combined = normalizeText(
    `${meta.commonName || ''} ${meta.scientificName || ''} ${meta.family || ''}`
  );

  if (iconic === 'aves') return 'aves';
  if (iconic === 'arachnida') return 'insectos_aracnidos';
  if (
    iconic === 'reptilia' ||
    iconic === 'amphibia' ||
    iconic === 'mammalia' ||
    iconic === 'mollusca' ||
    iconic === 'actinopterygii'
  ) {
    return 'fauna_vecina';
  }

  // Palabras clave taxonómicas y vernáculas de alta precisión (singular y plural)
  if (
    /\b(mariposas?|polillas?|orugas?|esfinges?|lepidoptera|nymphalidae|pieridae|papilionidae|hesperiidae|lycaenidae|sphingidae|saturniidae|danaus|agraulis|morpho|vanessa|junonia|eurema|ascia|aellopos|heliconius|papilio|phoebis|pieris|colias|dryas)\b/.test(
      combined
    )
  ) {
    return 'mariposas';
  }

  if (
    /\b(abejas?|abejitas?|abejorros?|mangangas?|yatei|melipon\w*|apidae|megachilidae|halictidae|andrenidae|colletidae|anthophila|apis|bombus|xylocopa|tetragonisca|megachile|augochlora|centris|euglossa)\b/.test(
      combined
    )
  ) {
    return 'abejas_abejorros';
  }

  if (
    iconic === 'insecta' ||
    /\b(insectos?|aranas?|aranitas?|aracnid\w*|vaquitas?|mariquitas?|mantis|mamboretas?|libelulas?|alguaciles?|escarabajos?|cascarudos?|toritos?|hormigas?|avispas?|grillos?|langostas?|saltamontes|chicharras?|cigarras?|bichos?|moscas?|mosquitos?|chinches?|bichitos?|coleoptera|hemiptera|odonata|orthoptera|hymenoptera|diptera|mantodea|araneae|salticidae|araneidae|coccinellidae|formicidae|scarabaeidae|cicadidae|armadillidi\w*)\b/.test(
      combined
    )
  ) {
    return 'insectos_aracnidos';
  }

  if (
    /\b(lagartijas?|lagartos?|gekos?|geckos?|salamanquesas?|sapos?|ranas?|ranitas?|escuerzos?|comadrejas?|zarigueyas?|cuises?|cuis|murcielagos?|zorros?|liebres?|caracoles?|caracol|babosas?|tortugas?|culebras?|serpientes?|ratones?|ardillas?|teius|salvator|hemidactylus|rhinella|boana|didelphis|cornu|cavia)\b/.test(
      combined
    )
  ) {
    return 'fauna_vecina';
  }

  return 'aves';
}

export function getSpeciesGroup(
  species?: Partial<SpeciesCatalogEntry> | null
): OrganismGroup {
  if (!species) return 'aves';
  if (species.organismGroup && VALID_ORGANISM_GROUPS.has(species.organismGroup)) {
    return species.organismGroup;
  }
  return inferOrganismGroupFromMeta({
    scientificName: species.scientificName,
    commonName: species.commonNameAr,
    family: species.family,
  });
}

export function buildStableTaxonIdFromScientificName(scientificName: string): string {
  const clean = normalizeText(scientificName).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return clean ? `sp_${clean}` : `sp_${Date.now()}`;
}

export function registerCustomSpecies(entry: SpeciesCatalogEntry): SpeciesCatalogEntry {
  const existingStatic =
    BIOMA_ARGENTINA_CATALOG.find((s) => s.taxonId === entry.taxonId) ||
    BIOMA_ARGENTINA_CATALOG.find(
      (s) => normalizeText(s.scientificName) === normalizeText(entry.scientificName)
    );
  if (existingStatic) {
    // Enriquecer referencias sin sobrescribir la ficha curada
    if (entry.referencePhotos?.length && !existingStatic.referencePhotos?.length) {
      existingStatic.referencePhotos = entry.referencePhotos;
    }
    if (entry.wikipediaUrl && !existingStatic.wikipediaUrl) {
      existingStatic.wikipediaUrl = entry.wikipediaUrl;
    }
    return existingStatic;
  }

  const normalizedGroup = getSpeciesGroup(entry);
  const prev = dynamicSpeciesRegistry.get(entry.taxonId);
  const merged: SpeciesCatalogEntry = prev
    ? {
        ...prev,
        ...entry,
        organismGroup: entry.organismGroup || prev.organismGroup || normalizedGroup,
        ecologicalRole: entry.ecologicalRole || prev.ecologicalRole,
        coexistenceNote: entry.coexistenceNote || prev.coexistenceNote,
        referencePhotos: entry.referencePhotos?.length ? entry.referencePhotos : prev.referencePhotos,
        alternativeNames: Array.from(
          new Set([...(prev.alternativeNames || []), ...(entry.alternativeNames || [])])
        ),
      }
    : {
        ...entry,
        organismGroup: normalizedGroup,
      };

  dynamicSpeciesRegistry.set(merged.taxonId, merged);
  return merged;
}

export function hydrateCustomSpecies(entries: SpeciesCatalogEntry[] | undefined): void {
  if (!entries || !Array.isArray(entries)) return;
  for (const entry of entries) {
    if (entry && entry.taxonId && entry.scientificName) {
      registerCustomSpecies(entry);
    }
  }
}

export function getCustomSpeciesList(): SpeciesCatalogEntry[] {
  return Array.from(dynamicSpeciesRegistry.values());
}

export function getAllKnownSpecies(): SpeciesCatalogEntry[] {
  return [...BIOMA_ARGENTINA_CATALOG, ...Array.from(dynamicSpeciesRegistry.values())];
}

export function findSpeciesByTaxonId(
  taxonId: string | null | undefined
): SpeciesCatalogEntry | undefined {
  if (!taxonId) return undefined;
  return (
    BIOMA_ARGENTINA_CATALOG.find((s) => s.taxonId === taxonId) ||
    dynamicSpeciesRegistry.get(taxonId)
  );
}

export function findSpeciesByScientificName(
  scientificName: string | null | undefined
): SpeciesCatalogEntry | undefined {
  if (!scientificName) return undefined;
  const target = normalizeText(scientificName);
  return getAllKnownSpecies().find((s) => normalizeText(s.scientificName) === target);
}

export function searchSpeciesCatalog(
  query: string,
  groupFilter: OrganismGroup | 'todos' = 'todos'
): SpeciesCatalogEntry[] {
  const all = getAllKnownSpecies().filter(
    (s) => groupFilter === 'todos' || getSpeciesGroup(s) === groupFilter
  );
  const q = normalizeText(query);
  if (!q) return all;
  return all.filter(
    (s) =>
      normalizeText(s.commonNameAr).includes(q) ||
      normalizeText(s.scientificName).includes(q) ||
      s.alternativeNames.some((alt) => normalizeText(alt).includes(q)) ||
      normalizeText(s.family).includes(q) ||
      normalizeText(s.ecologicalRole || '').includes(q)
  );
}
