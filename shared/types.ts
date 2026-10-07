// Types shared by the Nitro server and the Vue client.
// Geometry is in PDF points, top-left origin, after page rotation (MuPDF display space).

export type Rect = [x0: number, y0: number, x1: number, y1: number]
export type Point = [x: number, y: number]
export type RGB = [r: number, g: number, b: number] // 0..1

/** Bundled fallback families (Liberation, metric-compatible with Helvetica/Arial, Times, Courier). */
export type FallbackFamily = 'sans' | 'serif' | 'mono'
export type Align = 'left' | 'center' | 'right'

export interface FontInfo {
  key: string
  /** BaseFont as written in the file, e.g. `ABCDEF+Calibri-Bold`. */
  rawName: string
  /** Human family name with subset tag and style suffix removed, e.g. `Calibri`. */
  family: string
  bold: boolean
  italic: boolean
  serif: boolean
  mono: boolean
  embedded: boolean
  subset: boolean
  /** PDF font subtype: Type1, TrueType, Type0, Type3, MMType1. */
  type: string
  /** Format of the embedded program, when embedded. */
  program?: 'TrueType' | 'Type1' | 'CFF' | 'OpenType'
  /** The bundled family used when this font cannot draw a character. */
  fallback: FallbackFamily
}

export interface Run {
  text: string
  fontKey: string
  size: number
  color: RGB
  bbox: Rect
}

export interface Line {
  bbox: Rect
  /** Baseline origin of the first character. */
  origin: Point
  /** Writing direction in display space; [1, 0] is left-to-right horizontal. */
  dir: Point
  runs: Run[]
  text: string
}

export interface TextStyle {
  /** Font of the dominant run, or absent for a new text box. */
  fontKey?: string
  family: FallbackFamily
  size: number
  color: RGB
  bold: boolean
  italic: boolean
  align: Align
}

export interface Block {
  id: string
  bbox: Rect
  lines: Line[]
  /** Lines joined with `\n`. */
  text: string
  /** Dominant style, used when the block is rewritten. */
  style: TextStyle
  editable: boolean
  /** Why the block is read-only, in plain language. */
  readOnlyReason?: string
  /** True when the block mixes fonts, sizes or colors (an edit collapses them). */
  mixed: boolean
}

export interface PageModel {
  index: number
  width: number
  height: number
  rotation: number
  blocks: Block[]
}

export interface DocModel {
  id: string
  name: string
  bytes: number
  pageCount: number
  pages: PageModel[]
  fonts: Record<string, FontInfo>
  /** Epoch ms when the upload is deleted from the server. */
  expiresAt: number
}

/** `original` keeps the block's font; a family switches to a bundled font. */
export type FontChoice = 'original' | FallbackFamily

export interface StyleOverride {
  font?: FontChoice
  /** Switch to another font used in this file (with `font: 'original'`). */
  fontKey?: string
  size?: number
  color?: RGB
  bold?: boolean
  italic?: boolean
  align?: Align
}

export interface NewTextStyle {
  /** Bundled family, also the fallback when `fontKey` can't draw a letter. */
  font: FallbackFamily
  /** A font used in this file, from `DocModel.fonts`. */
  fontKey?: string
  size: number
  color: RGB
  bold: boolean
  italic: boolean
  align: Align
}

interface OpBase {
  /** Client-generated id, echoed back in the render report. */
  id: string
}

export interface EditBlockOp extends OpBase {
  type: 'editBlock'
  page: number
  blockId: string
  text: string
  style?: StyleOverride
}

export interface AddTextOp extends OpBase {
  type: 'addText'
  page: number
  /** Top-left of the box in display space. */
  x: number
  y: number
  width: number
  text: string
  style: NewTextStyle
}

export interface DeletePageOp extends OpBase {
  type: 'deletePage'
  page: number
}

export interface RotatePageOp extends OpBase {
  type: 'rotatePage'
  page: number
  angle: 90 | 180 | 270
}

export interface ReorderPagesOp extends OpBase {
  type: 'reorderPages'
  /** Original page indices in their new order (deleted pages omitted). */
  order: number[]
}

export type TextOp = EditBlockOp | AddTextOp
export type PageOp = DeletePageOp | RotatePageOp | ReorderPagesOp
export type EditOp = TextOp | PageOp

/** How one text op was drawn, returned by render/export. */
export interface OpReport {
  opId: string
  /** Font actually used, in plain words (e.g. `Calibri (original)`, `Liberation Sans`). */
  fontUsed: string
  substituted: boolean
  /** Plain-language reason when substituted. */
  reason?: string
  /** Box the new text occupies, display space of the original page. */
  bbox: Rect
}

export interface RenderReport {
  ops: OpReport[]
}

export const RENDER_REPORT_HEADER = 'x-edit-report'
export const UPLOAD_TTL_MS = 30 * 60 * 1000
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
