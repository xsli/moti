import { redrawFigure } from "@/lib/ai/redraw";

export async function redrawDiagram(photo: string): Promise<string | null> {
  const drawn = await redrawFigure({ data: { imageDataUrl: photo } });
  return drawn.ok ? drawn.image : null;
}
