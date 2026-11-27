/**
 * Pure product installation intelligence and dynamic AI prompt builder.
 * No I/O or server-only imports so it can be unit-tested directly.
 */

export type InstallationCategory =
  | 'floor_tile'
  | 'wall_tile'
  | 'steel_door'
  | 'wash_basin'
  | 'faucet_tap'
  | 'toilet_sanitaryware'
  | 'kitchen_sink'
  | 'mirror_accessory'
  | 'wall_panel'
  | 'unsupported';

export interface RoomAnalysis {
  roomType: string;
  floorRegion: string;
  wallRegions: string;
  ceiling: string;
  doorOpenings: string[];
  windows: string[];
  existingFurniture: string[];
  existingSanitaryware: string[];
  cameraAngle: string;
  lightingDirection: string;
  perspectiveNotes: string;
  suitableLocations: {
    category: InstallationCategory | string;
    location: string;
    replacesExisting: boolean;
    notes: string;
  }[];
}

export interface ProductPromptInput {
  productId: string;
  variantId: string;
  name: string;
  categoryName: string;
  brand: string | null;
  sku: string;
  variantLabel: string;
  sizeLabel: string | null;
  material: string | null;
  colour: string | null;
  finish: string | null;
  application: string | null;
  specs: Record<string, unknown>;
  installationLocation?: string | null;
  referenceImageCount: number;
}

const UNSUPPORTED_KEYWORDS = [
  'adhesive',
  'tile spacer',
  'spacer',
  'grout',
  'waterproof',
  'chemical',
  'epoxy',
  'sealant',
  'primer',
  'trowel',
  'cutter',
  'installation tool',
  'leveling clip',
];

export function classifyProduct(input: {
  name: string;
  categoryName: string;
  application?: string | null;
}): InstallationCategory {
  const text = `${input.categoryName} ${input.name} ${input.application ?? ''}`.toLowerCase();

  if (UNSUPPORTED_KEYWORDS.some((kw) => text.includes(kw))) {
    return 'unsupported';
  }
  if (
    text.includes('floor tile') ||
    text.includes('vitrified') ||
    text.includes('parking tile') ||
    text.includes('porcelain tile') ||
    (text.includes('tile') && (text.includes('floor') || text.includes('marble') || text.includes('granite')))
  ) {
    return 'floor_tile';
  }
  if (
    text.includes('wall tile') ||
    text.includes('elevation') ||
    text.includes('dado') ||
    text.includes('backsplash') ||
    text.includes('ceramic wall') ||
    text.includes('tile')
  ) {
    return 'wall_tile';
  }
  if (text.includes('steel door') || text.includes('security door') || text.includes('door')) {
    return 'steel_door';
  }
  if (text.includes('kitchen sink') || (text.includes('sink') && text.includes('kitchen'))) {
    return 'kitchen_sink';
  }
  // Faucets/taps must be checked BEFORE wash basins because product names like
  // "Basin Faucet" contain both "basin" and "faucet".
  if (
    text.includes('faucet') ||
    text.includes('tap') ||
    text.includes('mixer') ||
    text.includes('bib cock') ||
    text.includes('pillar cock') ||
    text.includes('diverter')
  ) {
    return 'faucet_tap';
  }
  if (text.includes('wash basin') || text.includes('basin') || text.includes('vanity')) {
    return 'wash_basin';
  }
  if (
    text.includes('toilet') ||
    text.includes('commode') ||
    text.includes('water closet') ||
    /\bwc\b/.test(text) ||
    text.includes('urinal')
  ) {
    return 'toilet_sanitaryware';
  }
  if (
    text.includes('wall panel') ||
    text.includes('fluted') ||
    text.includes('louver') ||
    text.includes('cladding') ||
    text.includes('decorative panel')
  ) {
    return 'wall_panel';
  }
  if (
    text.includes('mirror') ||
    text.includes('shower') ||
    text.includes('towel') ||
    text.includes('soap dispenser') ||
    text.includes('accessory') ||
    text.includes('accessories')
  ) {
    return 'mirror_accessory';
  }
  return 'mirror_accessory';
}

export function isSupportedForVisualization(category: InstallationCategory): boolean {
  return category !== 'unsupported';
}

export function defaultLocationsForCategory(category: InstallationCategory): string[] {
  switch (category) {
    case 'floor_tile':
      return ['Main floor surface', 'Entire visible floor'];
    case 'wall_tile':
      return ['Main feature wall', 'Shower/wet area walls', 'Backsplash wall', 'All visible walls'];
    case 'steel_door':
      return ['Existing main doorway opening', 'Secondary doorway opening'];
    case 'wash_basin':
      return ['Existing basin / vanity counter', 'Bathroom wall vanity area'];
    case 'faucet_tap':
      return ['Existing basin / sink faucet mount', 'Wall-mounted tap point above basin'];
    case 'toilet_sanitaryware':
      return ['Existing toilet / commode location'];
    case 'kitchen_sink':
      return ['Existing kitchen countertop sink cutout'];
    case 'mirror_accessory':
      return ['Wall above wash basin', 'Shower area wall', 'Adjacent bathroom wall'];
    case 'wall_panel':
      return ['Primary accent wall', 'TV / headboard feature wall'];
    case 'unsupported':
      return [];
  }
}

export function getInstallationInstructions(
  category: InstallationCategory,
  product: ProductPromptInput,
): string {
  const finishNote = product.finish ? ` Preserve the exact "${product.finish}" surface finish.` : '';
  const colourNote = product.colour ? ` Preserve the exact "${product.colour}" colour.` : '';
  const sizeNote = product.sizeLabel ? ` Respect product dimensions/size (${product.sizeLabel}).` : '';

  switch (category) {
    case 'floor_tile':
      return `FLOOR TILE INSTALLATION: Replace ONLY the visible floor surface with this exact tile design, colour, veining, and texture. Apply realistic tile repetition with subtle natural grout lines following the room's floor perspective.${sizeNote}${finishNote} Preserve all furniture, rugs, cabinets, legs, shadows, and reflections on top of the floor. Do NOT apply floor tiles to walls or ceiling.`;
    case 'wall_tile':
      return `WALL TILE INSTALLATION: Apply this exact tile pattern, colour, and finish ONLY to the intended wall surface (${product.installationLocation || 'appropriate wall'}). Follow wall perspective and maintain realistic grout lines and tile proportions.${sizeNote}${finishNote} Preserve doors, windows, mirrors, and wall-mounted fixtures.`;
    case 'steel_door':
      return `STEEL DOOR INSTALLATION: Fit this exact door cleanly inside the existing doorway opening (${product.installationLocation || 'existing doorway'}). Preserve the door's panel geometry, colour, frame, and handle design.${colourNote}${finishNote} Maintain doorway perspective and surrounding walls/flooring. Never place a door on a blank wall without a doorway.`;
    case 'wash_basin':
      return `WASH BASIN INSTALLATION: Replace the existing wash basin or install on the suitable vanity location (${product.installationLocation || 'vanity / basin area'}). Preserve the exact basin silhouette, material, and mounting style.${colourNote}${finishNote} Maintain compatibility with the countertop and generate realistic contact shadows.`;
    case 'faucet_tap':
      return `FAUCET / TAP INSTALLATION: Replace the existing faucet at the basin/sink mount (${product.installationLocation || 'basin faucet mount'}). Preserve the exact spout shape, handle design, material, and finish.${colourNote}${finishNote} Keep realistic scale and orientation (e.g., brushed brass must remain brushed brass, matte black must remain matte black).`;
    case 'toilet_sanitaryware':
      return `TOILET / SANITARYWARE INSTALLATION: Replace the existing toilet at its plumbing location (${product.installationLocation || 'existing toilet position'}). Respect floor-mounted vs wall-hung installation type, proportional scale, and contact shadows.${colourNote}${finishNote}`;
    case 'kitchen_sink':
      return `KITCHEN SINK INSTALLATION: Integrate this exact sink into the kitchen countertop cutout (${product.installationLocation || 'existing sink cutout'}). Respect the exact number of bowls, material, finish, and countertop geometry.${colourNote}${finishNote}`;
    case 'mirror_accessory':
      return `MIRROR / BATHROOM ACCESSORY INSTALLATION: Mount cleanly at ${product.installationLocation || 'its appropriate wall location'} with realistic proportional scale, lighting reflections, and wall contact shadows.${colourNote}${finishNote}`;
    case 'wall_panel':
      return `DECORATIVE WALL PANEL INSTALLATION: Apply the panel design to the intended accent wall (${product.installationLocation || 'main feature wall'}), preserving groove/flute rhythm, material texture, colour, and lighting shadows.${colourNote}${finishNote}`;
    case 'unsupported':
      return 'UNSUPPORTED: Do not force installation consumables or tools into the room photograph.';
  }
}

export interface ConflictWarning {
  category: InstallationCategory;
  message: string;
}

export function detectProductConflicts(
  items: { productId: string; name: string; category: InstallationCategory; location?: string | null }[],
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const singletonCategories: InstallationCategory[] = [
    'floor_tile',
    'toilet_sanitaryware',
    'kitchen_sink',
  ];

  for (const cat of singletonCategories) {
    const matching = items.filter((i) => i.category === cat);
    if (matching.length > 1) {
      warnings.push({
        category: cat,
        message: `Multiple products selected for the same surface/fixture (${matching.map((m) => m.name).join(', ')}). Replace one so they do not overlap.`,
      });
    }
  }

  return warnings;
}

const PROMPT_FOUNDATION = `You are a professional architectural visualization and interior product installation AI.

The first reference image is the customer's original room photograph. The remaining reference images contain the actual catalogue products selected by the customer.

Analyze the room structure and identify the physically appropriate installation location for each selected product.

Realistically install or replace the selected products inside the original room.

Preserve the selected product's shape, colour, design, texture, material, finish and proportions as closely as possible.

Maintain the original room geometry, camera angle, perspective, lighting, shadows and reflections.

Do not paste the rectangular product photograph into the room.

Do not reproduce the background of the product reference photograph.

Do not substitute the selected product with an unrelated product.

Do not modify unrelated furniture, walls, floors or decorations.

The final output must look like a genuine photograph of the customer's original room after the selected products have been installed.`;

export interface MultiPassContext {
  passNumber: number;
  totalPasses: number;
  previouslyInstalledNames: string[];
}

export function buildVisualizationPrompt(input: {
  roomAnalysis: RoomAnalysis;
  products: ProductPromptInput[];
  passContext?: MultiPassContext;
}): string {
  const { roomAnalysis, products, passContext } = input;

  const roomSection = [
    '--- ROOM ANALYSIS ---',
    `Room type: ${roomAnalysis.roomType}`,
    `Floor region: ${roomAnalysis.floorRegion}`,
    `Wall regions: ${roomAnalysis.wallRegions}`,
    `Ceiling: ${roomAnalysis.ceiling}`,
    roomAnalysis.doorOpenings.length > 0 ? `Door openings: ${roomAnalysis.doorOpenings.join('; ')}` : null,
    roomAnalysis.windows.length > 0 ? `Windows: ${roomAnalysis.windows.join('; ')}` : null,
    roomAnalysis.existingFurniture.length > 0 ? `Existing furniture to preserve: ${roomAnalysis.existingFurniture.join('; ')}` : null,
    roomAnalysis.existingSanitaryware.length > 0 ? `Existing sanitaryware/fixtures: ${roomAnalysis.existingSanitaryware.join('; ')}` : null,
    `Camera angle & perspective: ${roomAnalysis.cameraAngle} — ${roomAnalysis.perspectiveNotes}`,
    `Lighting direction: ${roomAnalysis.lightingDirection}`,
  ]
    .filter(Boolean)
    .join('\n');

  const passNote =
    passContext && passContext.passNumber > 1 && passContext.previouslyInstalledNames.length > 0
      ? `\n\n--- MULTI-PASS CONTINUITY (PASS ${passContext.passNumber} OF ${passContext.totalPasses}) ---\nThe first reference image already includes previously installed products (${passContext.previouslyInstalledNames.join(', ')}). Preserve those previously installed products intact while installing the new products below.`
      : '';

  let refIndex = 2; // Image #1 is the room photograph
  const productSections = products.map((p, idx) => {
    const category = classifyProduct(p);
    const refRange =
      p.referenceImageCount > 1
        ? `Reference Images #${refIndex}–#${refIndex + p.referenceImageCount - 1}`
        : p.referenceImageCount === 1
          ? `Reference Image #${refIndex}`
          : 'No reference image (use specs strictly)';
    refIndex += p.referenceImageCount;

    const specsPairs = Object.entries(p.specs ?? {})
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');

    const lines = [
      `Product ${idx + 1}: ${p.name} (${refRange})`,
      `- Category: ${p.categoryName} | Installation type: ${category}`,
      p.brand ? `- Brand: ${p.brand}` : null,
      `- SKU / Variant: ${p.sku} / ${p.variantLabel}${p.sizeLabel ? ` (${p.sizeLabel})` : ''}`,
      p.material ? `- Material: ${p.material}` : null,
      p.colour ? `- Colour: ${p.colour}` : null,
      p.finish ? `- Surface finish: ${p.finish}` : null,
      p.application ? `- Application: ${p.application}` : null,
      specsPairs ? `- Specifications: ${specsPairs}` : null,
      `- Target location: ${p.installationLocation || defaultLocationsForCategory(category)[0] || 'Appropriate physical location'}`,
      `- Installation directive: ${getInstallationInstructions(category, p)}`,
    ];
    return lines.filter(Boolean).join('\n');
  });

  return `${PROMPT_FOUNDATION}${passNote}\n\n${roomSection}\n\n--- SELECTED PRODUCTS TO INSTALL ---\n${productSections.join('\n\n')}`;
}
