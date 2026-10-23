// SEED template grup untuk tombol "Isi Data Contoh" (collection "optionGroups"). Salinan dari Customer App.
// Bentuk field HARUS sama dengan dokumen Firestore. Dipakai useOptionGroups kalau
// collection kosong / gagal dibaca, sama seperti pola seedMenuItems.
//
// Catatan skema:
// - choices[].summary (opsional): teks ringkas untuk "Es Sedikit · Gula 50%".
//   Kalau tidak ada, dipakai label pilihan.
// - ui 'note' = teks bebas, tidak punya choices.

export const seedOptionGroups = [
  {
    id: 'base',
    label: 'Dasar Teh',
    type: 'single',
    ui: 'radio',
    required: true,
    min: 1,
    max: 1,
    defaultChoiceId: 'jasmine',
    order: 0,
    active: true,
    choices: [
      { id: 'jasmine', label: 'Jasmine', priceDelta: 0, available: true },
      { id: 'oolong', label: 'Oolong', priceDelta: 0, available: true },
      { id: 'green', label: 'Green Tea', priceDelta: 0, available: true },
      { id: 'black', label: 'Black Tea', priceDelta: 0, available: true },
      { id: 'chamomile', label: 'Chamomile', priceDelta: 0, available: true },
    ],
  },
  {
    id: 'es',
    label: 'Es',
    type: 'single',
    ui: 'cards',
    required: true,
    min: 1,
    max: 1,
    defaultChoiceId: 'sedikit',
    order: 1,
    active: true,
    choices: [
      { id: 'panas', label: 'Panas', icon: 'local_fire_department', priceDelta: 0, available: true },
      { id: 'normal', label: 'Es Normal', icon: 'ac_unit', priceDelta: 0, available: true },
      { id: 'sedikit', label: 'Es Sedikit', icon: 'water_drop', priceDelta: 0, available: true },
      { id: 'tanpa', label: 'Tanpa Es', icon: 'block', priceDelta: 0, available: true },
    ],
  },
  {
    id: 'gula',
    label: 'Gula',
    type: 'single',
    ui: 'segmented',
    required: true,
    min: 1,
    max: 1,
    defaultChoiceId: 'g50',
    order: 2,
    active: true,
    choices: [
      { id: 'g0', label: '0%', summary: 'Gula 0%', priceDelta: 0, available: true },
      { id: 'g25', label: '25%', summary: 'Gula 25%', priceDelta: 0, available: true },
      { id: 'g50', label: '50%', summary: 'Gula 50%', priceDelta: 0, available: true },
      { id: 'g100', label: '100%', summary: 'Gula 100%', priceDelta: 0, available: true },
    ],
  },
  {
    id: 'susu',
    label: 'Jenis Susu',
    type: 'single',
    ui: 'radio',
    required: true,
    min: 1,
    max: 1,
    defaultChoiceId: 'original',
    order: 3,
    active: true,
    choices: [
      { id: 'original', label: 'Original', priceDelta: 0, available: true },
      { id: 'oat', label: 'Oat', priceDelta: 0, available: true },
    ],
  },
  {
    id: 'topping',
    label: 'Topping',
    type: 'multi',
    ui: 'toppings',
    required: false,
    min: 0,
    max: null, // null = tanpa batas
    defaultChoiceId: null,
    order: 4,
    active: true,
    choices: [
      { id: 'pearl', label: 'Pearl', priceDelta: 3000, available: true },
      { id: 'jelly', label: 'Jelly', priceDelta: 3000, available: true },
      { id: 'lemon', label: 'Lemon Slice', priceDelta: 2000, available: true },
    ],
  },
  {
    id: 'catatan',
    label: 'Catatan',
    type: 'single',
    ui: 'note',
    required: false,
    min: 0,
    max: 1,
    defaultChoiceId: null,
    order: 5,
    active: true,
    choices: [],
  },
]
