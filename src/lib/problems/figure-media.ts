export type FigureMedia = {
  image?: string;
  originalImage?: string;
  redrawError?: string;
  svg: string;
};

export function originalFigureImage(figure: FigureMedia): string | undefined {
  return figure.originalImage || figure.image;
}

export function applyFigureRedraw<T extends FigureMedia>(figure: T, image: string): T & FigureMedia {
  const originalImage = originalFigureImage(figure);
  if (!originalImage) return figure;
  return { ...figure, originalImage, image, svg: "", redrawError: undefined };
}

export function restoreFigureOriginal<T extends FigureMedia>(figure: T): T & FigureMedia {
  if (!figure.originalImage) return figure;
  return { ...figure, image: figure.originalImage, originalImage: undefined, svg: "", redrawError: undefined };
}

export function cleanOriginalImage(value: unknown): string | undefined {
  return typeof value === "string" && /^data:image\/(?:png|jpeg|webp);base64,/.test(value)
    && value.length <= 16_000_000 ? value : undefined;
}
