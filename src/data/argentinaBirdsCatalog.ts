import { SpeciesCatalogEntry } from '../types/domain';

/**
 * Catálogo taxonómico de aves de Argentina (referencia eBird es_AR)
 * Datos verídicos, concisos y adaptados al español rioplatense.
 */
export const ARGENTINA_BIRDS_CATALOG: SpeciesCatalogEntry[] = [
  {
    taxonId: 'rufhor2',
    scientificName: 'Furnarius rufus',
    commonNameAr: 'Hornero común',
    alternativeNames: ['Hornero', 'Casero', 'Alonso'],
    family: 'Furnariidae (Furnáridos)',
    identificationTraits:
      'Plumaje pardo rojizo (rufo) uniforme en dorso y cola, garganta blanquecina y pecho claro. Pico esbelto levemente curvado hacia abajo y patas largas grisáceas. Camina con paso firme y elegante por el césped.',
    typicalBehavior:
      'Caminador terrícola muy confiado en jardines y parques. Construye en pareja su inconfundible nido cerrado de barro con forma de horno sobre postes, cornisas o ramas gruesas y canta a dúo batiendo las alas.',
    dietAndHabitat:
      'Se alimenta de insectos, lombrices y larvas que busca picoteando el suelo húmedo. Habita jardines urbanos, plazas, áreas rurales y montes abiertos.',
    generalDistribution:
      'Ave Nacional de la Argentina. Muy común en el centro, norte y litoral del país, en expansión hacia el norte patagónico.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Misiones', 'Corrientes', 'La Pampa'],
    defaultWatercolorPlate: '/plates/acuarela_hornero.jpg',
    defaultGraphitePlate: '/plates/grafito_hornero.jpg',
  },
  {
    taxonId: 'rucspa1',
    scientificName: 'Zonotrichia capensis',
    commonNameAr: 'Chingolo',
    alternativeNames: ['Chingolito', 'Cachilo'],
    family: 'Passerellidae (Paserélidos)',
    identificationTraits:
      'Pequeño y compacto, con un semicopete gris estriado de negro que suele erizar, mejillas grises enmarcadas en negro y un collar canela rojizo muy marcado en la nuca y lados del cuello.',
    typicalBehavior:
      'Inquieto y simpático; da pequeños saltitos en el suelo buscando semillas y migas. Su canto claro de tres o cuatro silbidos seguidos de un trino final es uno de los sonidos más familiares del amanecer.',
    dietAndHabitat:
      'Consume semillas de pastos, pequeños frutos e insectos en época reproductiva. Frecuenta jardines, parques, pastizales, sierras y bosques abiertos.',
    generalDistribution:
      'Presente en absolutamente todas las provincias de la Argentina, desde la Puna y el Litoral hasta Tierra del Fuego.',
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
    identificationTraits:
      'Pecho y vientre de color amarillo brillante, dorso pardo y cabeza negra atravesada por una ancha ceja blanca tipo vincha que oculta una corona amarilla. Pico negro robusto y recto.',
    typicalBehavior:
      'Vocal, audaz y territorial. Se posa en lugares altos o cables vigilando el entorno y anuncia su presencia con su potente grito «¡bichofeo!» o «¡bien-te-veo!». Suele zambullirse sobre estanques o piletas.',
    dietAndHabitat:
      'Omnívoro y oportunista: captura insectos al vuelo, lombrices, pequeños peces, frutos y bayas. Muy adaptable a jardines, arboledas y riberas.',
    generalDistribution:
      'Abundante en todo el norte, centro, Cuyo y litoral argentino, llegando hasta el norte de la Patagonia.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Entre Ríos', 'Tucumán'],
    defaultWatercolorPlate: '/plates/acuarela_benteveo.jpg',
    defaultGraphitePlate: '/plates/grafito_benteveo.jpg',
  },
  {
    taxonId: 'rubthr1',
    scientificName: 'Turdus rufiventris',
    commonNameAr: 'Zorzal colorado',
    alternativeNames: ['Zorzal común', 'Chalchalero'],
    family: 'Turdidae (Túrdidos)',
    identificationTraits:
      'Dorso pardo oliváceo, garganta clara finamente estriada de oscuro y vientre de un característico tono anaranjado rojizo (rufo). Pico amarillento y anillo ocular amarillo vivo.',
    typicalBehavior:
      'Recorre el césped dando carreras cortas y deteniéndose erguido con la cabeza inclinada para escuchar lombrices bajo tierra. Su canto melodioso y aflautado se oye antes del amanecer en primavera.',
    dietAndHabitat:
      'Se alimenta de lombrices, insectos y frutos carnosos de árboles y arbustos. Muy frecuente en jardines arbolados, parques y selvas en galería.',
    generalDistribution:
      'Ampliamente distribuido en el norte, centro y este de la Argentina hasta la provincia de Buenos Aires y La Pampa.',
    typicalRegionsAr: ['Buenos Aires', 'Córdoba', 'Litoral', 'Noroeste'],
    defaultWatercolorPlate: '/plates/acuarela_zorzal.jpg',
    defaultGraphitePlate: '/plates/grafito_chingolo.jpg',
  },
  {
    taxonId: 'saytan1',
    scientificName: 'Thraupis sayaca',
    commonNameAr: 'Celestino común',
    alternativeNames: ['Chogüí', 'Celestino'],
    family: 'Thraupidae (Tráupidos)',
    identificationTraits:
      'Plumaje general gris azulado celeste suave, con alas y cola de un azul turquesa más intenso en los bordes. Pico corto y cónico de tono gris azulado.',
    typicalBehavior:
      'Activo en las copas de los árboles y arbustos frutales, generalmente en parejas o pequeños grupos familiares. Emite silbidos agudos y suaves mientras salta entre el follaje.',
    dietAndHabitat:
      'Principalmente frugívoro (higos, moras, nísperos, frutos nativos), complementando con insectos y pétalos de flores. Frecuenta jardines con frutales y bordes de monte.',
    generalDistribution:
      'Norte, litoral y centro de la Argentina hasta el noreste de la provincia de Buenos Aires.',
    typicalRegionsAr: ['Buenos Aires', 'Entre Ríos', 'Corrientes', 'Misiones', 'Santa Fe', 'Córdoba'],
    defaultWatercolorPlate: '/plates/acuarela_hornero.jpg',
    defaultGraphitePlate: '/plates/grafito_hornero.jpg',
  },
  {
    taxonId: 'redcre1',
    scientificName: 'Paroaria coronata',
    commonNameAr: 'Cardenal común',
    alternativeNames: ['Cardenal de copete rojo', 'Cardenal'],
    family: 'Thraupidae (Tráupidos)',
    identificationTraits:
      'Inconfundible copete erguido, cara y garganta de color rojo escarlata brillante, que contrastan con el pecho y vientre blancos puros y el dorso gris plomizo. Pico cónico claro.',
    typicalBehavior:
      'Se mueve en parejas o pequeños grupos bajando al suelo despejado a buscar semillas. Posee un canto fuerte, pausado y muy musical desde ramas expuestas.',
    dietAndHabitat:
      'Granívoro e insectívoro: consume semillas, brotes tiernos y pequeños invertebrados. Habita montes abiertos, espinales, parques y jardines suburbanos.',
    generalDistribution:
      'Norte y centro de la Argentina hasta el norte patagónico (Río Negro).',
    typicalRegionsAr: ['Buenos Aires', 'Entre Ríos', 'Córdoba', 'La Pampa', 'Santa Fe', 'Corrientes'],
    defaultWatercolorPlate: '/plates/acuarela_benteveo.jpg',
    defaultGraphitePlate: '/plates/grafito_benteveo.jpg',
  },
  {
    taxonId: 'patmock1',
    scientificName: 'Mimus patagonicus',
    commonNameAr: 'Calandria mora',
    alternativeNames: ['Calandria patagónica'],
    family: 'Mimidae (Mímidos)',
    identificationTraits:
      'Plumaje gris pardusco con ceja blanca definida, garganta clara, flancos suavemente canelas y cola larga oscura con puntas blancas en las plumas externas.',
    typicalBehavior:
      'Curiosa y gran cantora, capaz de imitar el canto de otras aves del bosque y la estepa. Suele posarse en lo alto de arbustos moviendo la cola.',
    dietAndHabitat:
      'Insectos, pequeños invertebrados y frutos silvestres (calafate, maqui, laura). Típica de jardines cordilleranos, claros de bosque andino-patagónico y estepa.',
    generalDistribution:
      'Toda la región patagónica y cordillerana de la Argentina, desplazándose hacia el centro en invierno.',
    typicalRegionsAr: ['Lago Puelo', 'Bariloche', 'Chubut', 'Río Negro', 'Neuquén', 'Santa Cruz'],
    defaultWatercolorPlate: '/plates/acuarela_zorzal.jpg',
    defaultGraphitePlate: '/plates/grafito_chingolo.jpg',
  },
  {
    taxonId: 'chimango1',
    scientificName: 'Milvago chimango',
    commonNameAr: 'Chimango',
    alternativeNames: ['Caranchillo'],
    family: 'Falconidae (Falcónidos)',
    identificationTraits:
      'Rapaz mediana de plumaje pardo acanelado general, con una mancha clara en la base de las plumas primarias muy visible cuando vuela y patas amarillentas.',
    typicalBehavior:
      'Sumamente confiado e inteligente, camina por parques y jardines o planea en círculos bajos emitiendo un grito áspero y prolongado.',
    dietAndHabitat:
      'Omnívoro e insectívoro oportunista. Muy común en ambientes rurales, costas, jardines abiertos y valles patagónicos.',
    generalDistribution:
      'Presente en casi todo el territorio argentino, especialmente abundante en la región pampeana y la Patagonia.',
    typicalRegionsAr: ['Buenos Aires', 'Patagonia', 'Lago Puelo', 'La Pampa', 'Córdoba'],
    defaultWatercolorPlate: '/plates/acuarela_hornero.jpg',
    defaultGraphitePlate: '/plates/grafito_hornero.jpg',
  },
];

export function findSpeciesByTaxonId(taxonId: string | null | undefined): SpeciesCatalogEntry | undefined {
  if (!taxonId) return undefined;
  return ARGENTINA_BIRDS_CATALOG.find((s) => s.taxonId === taxonId);
}

export function searchSpeciesCatalog(query: string): SpeciesCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return ARGENTINA_BIRDS_CATALOG;
  return ARGENTINA_BIRDS_CATALOG.filter(
    (s) =>
      s.commonNameAr.toLowerCase().includes(q) ||
      s.scientificName.toLowerCase().includes(q) ||
      s.alternativeNames.some((alt) => alt.toLowerCase().includes(q)) ||
      s.family.toLowerCase().includes(q)
  );
}
