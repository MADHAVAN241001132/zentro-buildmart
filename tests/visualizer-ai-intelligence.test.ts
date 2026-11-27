import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVisualizationPrompt,
  classifyProduct,
  detectProductConflicts,
  isSupportedForVisualization,
  type RoomAnalysis,
} from '../lib/visualizer/product-intelligence';

test('classifies product categories and excludes unsupported consumables', () => {
  assert.equal(classifyProduct({ name: 'Statuario Marble Floor Tile', categoryName: 'Floor Tiles' }), 'floor_tile');
  assert.equal(classifyProduct({ name: 'Moroccan Ceramic Wall Tile', categoryName: 'Wall Tiles' }), 'wall_tile');
  assert.equal(classifyProduct({ name: 'Tata Pravesh Steel Door', categoryName: 'Doors' }), 'steel_door');
  assert.equal(classifyProduct({ name: 'Kohler Tabletop Wash Basin', categoryName: 'Sanitaryware' }), 'wash_basin');
  assert.equal(classifyProduct({ name: 'Brushed Brass Basin Faucet', categoryName: 'Faucets & Taps' }), 'faucet_tap');
  assert.equal(classifyProduct({ name: 'Wall Hung Commode WC', categoryName: 'Sanitaryware' }), 'toilet_sanitaryware');
  assert.equal(classifyProduct({ name: 'Double Bowl Quartz Kitchen Sink', categoryName: 'Kitchen Sinks' }), 'kitchen_sink');
  assert.equal(classifyProduct({ name: 'Fluted WPC Wall Panel', categoryName: 'Decorative Panels' }), 'wall_panel');
  assert.equal(classifyProduct({ name: 'Tile Adhesive 20kg', categoryName: 'Adhesives & Grouts' }), 'unsupported');
  assert.equal(isSupportedForVisualization('unsupported'), false);
  assert.equal(isSupportedForVisualization('floor_tile'), true);
});

test('detects conflicting products targeting the same surface/fixture', () => {
  const conflicts = detectProductConflicts([
    { productId: '1', name: 'Italian Marble Tile', category: 'floor_tile' },
    { productId: '2', name: 'Wooden Plank Tile', category: 'floor_tile' },
    { productId: '3', name: 'Steel Door', category: 'steel_door' },
  ]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.category, 'floor_tile');
});

test('builds dynamic prompt incorporating room analysis and exact product specs', () => {
  const roomAnalysis: RoomAnalysis = {
    roomType: 'Bathroom',
    floorRegion: 'Lower foreground ceramic floor',
    wallRegions: 'Left and back tiled walls',
    ceiling: 'Flat white painted ceiling',
    doorOpenings: ['Right-side wooden door'],
    windows: ['Small frosted ventilator window'],
    existingFurniture: ['Floating wooden vanity cabinet'],
    existingSanitaryware: ['White ceramic wash basin', 'Chrome mixer tap'],
    cameraAngle: 'Eye-level straight-on view',
    lightingDirection: 'Overhead warm LED + window daylight from right',
    perspectiveNotes: 'Central one-point perspective',
    suitableLocations: [],
  };

  const prompt = buildVisualizationPrompt({
    roomAnalysis,
    products: [
      {
        productId: 'p1',
        variantId: 'v1',
        name: 'Jaquar Brushed Brass Pillar Tap',
        categoryName: 'Faucets & Taps',
        brand: 'Jaquar',
        sku: 'JAQ-BB-101',
        variantLabel: 'Brushed Brass',
        sizeLabel: '150 mm',
        material: 'Solid Brass',
        colour: 'Brushed Brass',
        finish: 'Brushed Matte Brass',
        application: 'Basin mount',
        specs: { flowRate: '6 L/min' },
        installationLocation: 'Existing basin / sink faucet mount',
        referenceImageCount: 2,
      },
    ],
  });

  assert.ok(prompt.includes('professional architectural visualization'));
  assert.ok(prompt.includes('Room type: Bathroom'));
  assert.ok(prompt.includes('Jaquar Brushed Brass Pillar Tap'));
  assert.ok(prompt.includes('Reference Images #2–#3'));
  assert.ok(prompt.includes('Brushed Matte Brass'));
  assert.ok(prompt.includes('Do not paste the rectangular product photograph into the room'));

  const pass2Prompt = buildVisualizationPrompt({
    roomAnalysis,
    products: [
      {
        productId: 'p2',
        variantId: 'v2',
        name: 'LED Vanity Mirror',
        categoryName: 'Mirrors & Accessories',
        brand: 'Kohler',
        sku: 'KOH-MIR-202',
        variantLabel: '600x900mm',
        sizeLabel: '600x900 mm',
        material: 'Glass',
        colour: 'Warm White LED',
        finish: 'Frameless',
        application: 'Wall mount',
        specs: {},
        installationLocation: 'Wall above wash basin',
        referenceImageCount: 1,
      },
    ],
    passContext: {
      passNumber: 2,
      totalPasses: 2,
      previouslyInstalledNames: ['Jaquar Brushed Brass Pillar Tap'],
    },
  });

  assert.ok(pass2Prompt.includes('MULTI-PASS CONTINUITY (PASS 2 OF 2)'));
  assert.ok(pass2Prompt.includes('Jaquar Brushed Brass Pillar Tap'));
});
