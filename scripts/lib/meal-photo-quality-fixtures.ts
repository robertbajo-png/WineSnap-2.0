import type { MealPhotoEstimate } from "../../src/features/meal-photos/domain";

export const mealPhotoCases = ["empty", "no-scale", "cropped", "calibrated"] as const;
export type MealPhotoCase = (typeof mealPhotoCases)[number];
const width = 384;
const height = 288;

// Fixed, authored raster scenes. No image file, user input or downloaded asset is accepted.
export function mealPhotoFixture(id: MealPhotoCase) {
  const pixels = new Uint8Array(width * height * 3);
  const center = id === "cropped" ? 408 : id === "calibrated" ? 163 : 193;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const texture = ((x * 37 + y * 19 + x * y * 7) % 23) / 11 - 1;
      const light = 12 - (x + y) / 55 + texture * 2;
      let color = [54 + light, 59 + light, 62 + light];
      const plate = ((x - 191) / 157) ** 2 + ((y - 148) / 117) ** 2;
      if (plate < 1) {
        const shade = plate > 0.87 ? -8 : plate > 0.59 && plate < 0.72 ? -10 : 0;
        color = [225 + light + shade, 224 + light + shade, 218 + light + shade];
      }
      if (id !== "empty") {
        const u = x - center;
        const v = y - 143;
        const shadow = Math.exp(-(((u - 9) / 50) ** 2 + ((v - 39) / 17) ** 2));
        color = color.map((channel) => channel * (1 - shadow * 0.47));
        const contour = Math.min(
          ((u + 21) / 40) ** 2 + ((v + 12) / 46) ** 2,
          ((u - 23) / 37) ** 2 + ((v + 12) / 46) ** 2,
          (u / 48) ** 2 + ((v - 15) / 46) ** 2,
        );
        if (contour < 1) {
          const blush = 22 * Math.exp(-(((u + 29) / 27) ** 2 + ((v + 20) / 31) ** 2));
          const shade = 25 - contour * 25 - u / 4 - v / 5;
          const speckle = (x * 13 + y * 57 + x * y * 5) % 281 === 0 ? 30 : 0;
          color = [
            173 + shade + blush + texture * 9 + speckle,
            26 + shade * 0.38 + blush * 1.8 + texture * 5 + speckle,
            15 + shade * 0.3 + texture * 3,
          ];
        }
        if (v > -79 && v < -42 && Math.abs(u - 0.23 * (v + 51)) < 3.2)
          color = [91 + light, 54 + light, 32 + light];
        const leaf = ((u - 20) / 26) ** 2 + ((v + 75 + (u - 20) * 0.29) / 7) ** 2;
        if (leaf < 1) color = [54 + light, 104 + light - leaf * 26, 42 + light];
      }
      if (id === "calibrated" && x >= 42 && x <= 280 && y >= 222 && y <= 254) {
        const tick = (x - 50) % 19;
        const mark =
          x >= 50 && x <= 278 && ((tick >= 0 && tick < 2 && y < 241) || (tick === 9 && y < 230));
        color = mark ? [47, 37, 25] : [209 + texture * 5, 179 + texture * 5, 125];
      }
      const offset = (y * width + x) * 3;
      color.forEach((channel, index) => {
        pixels[offset + index] = Math.round(Math.max(0, Math.min(255, channel)));
      });
    }
  }
  if (id === "calibrated") {
    // Label the major marks explicitly; 19 pixels represent one centimetre in this scene.
    const font: Record<string, string[]> = {
      "0": ["111", "101", "101", "101", "111"],
      "2": ["111", "001", "111", "100", "111"],
      "4": ["101", "101", "111", "001", "001"],
      "6": ["111", "100", "111", "101", "111"],
      "8": ["111", "101", "111", "101", "111"],
      "1": ["010", "110", "010", "010", "111"],
      c: ["011", "100", "100", "100", "011"],
      m: ["00000", "11011", "10101", "10101", "10101"],
    };
    const tags = [
      [47, "0"],
      [85, "2"],
      [123, "4"],
      [161, "6"],
      [199, "8"],
      [233, "10"],
      [254, "cm"],
    ] as const;
    for (const [start, label] of tags) {
      let left = start;
      for (const glyph of label) {
        const rows = font[glyph];
        rows.forEach((row, y) =>
          [...row].forEach((pixel, x) => {
            if (pixel !== "1") return;
            for (let dy = 0; dy < 2; dy++)
              for (let dx = 0; dx < 2; dx++) {
                const index = (width * (242 + y * 2 + dy) + left + x * 2 + dx) * 3;
                pixels.set([48, 36, 23], index);
              }
          }),
        );
        left += rows[0].length * 2 + 2;
      }
    }
  }
  return { pixels, width, height };
}

export function gradeMealPhoto(id: MealPhotoCase, result: MealPhotoEstimate) {
  const { items } = result;
  const recognizableApple =
    items.length === 1 &&
    /^(?:(?:helt|rött|gult|grönt|delvis synligt) )?äpple(?:t)?$/iu.test(items[0].name);
  const unknownAmounts = items.every((item) => item.portion === null);
  const range = items[0]?.portion;
  const broadPlausibleEstimate =
    !!range &&
    range.minGrams >= 40 &&
    range.maxGrams <= 400 &&
    range.maxGrams - range.minGrams >= 20;
  const passed =
    id === "empty"
      ? items.length === 0
      : id === "cropped"
        ? (items.length === 0 || recognizableApple) && unknownAmounts
        : recognizableApple && (id === "no-scale" ? unknownAmounts : broadPlausibleEstimate);
  // The range check is only a sanity screen, not a measured weight or real-photo accuracy score.
  return {
    itemCount: items.length,
    recognizableApple,
    unknownAmounts,
    broadPlausibleEstimate,
    passed,
  };
}
