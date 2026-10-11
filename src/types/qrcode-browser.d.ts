declare module "qrcode/lib/browser.js" {
  export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  export interface QRSymbol {
    modules: {
      size: number;
      get(row: number, col: number): number;
      /** True for function-pattern modules (finder, timing, alignment, format, version). */
      isReserved(row: number, col: number): boolean;
    };
    version: number;
  }

  export function create(
    data: string,
    options?: { errorCorrectionLevel?: ErrorCorrectionLevel },
  ): QRSymbol;
}
