# Barcode Printing — Phases 3–6

Production-grade label printing for ABC ERP. Builds on existing Code128 barcodes, `BarcodeSequence`, category prefixes, POS scanning, and `/products/:id/barcode/preview`.

## Permissions

| Permission | Description | Roles |
|------------|-------------|-------|
| `barcode:view` | Barcode Center, logs, verify, diagnostics | super_admin, admin, warehouse, salesman |
| `barcode:print` | Create print jobs, calibration | super_admin, admin, warehouse |
| `barcode:manage` | Cancel queued jobs | super_admin, admin |

**Note:** Users must log out and back in (or refresh token) after deploy to receive new permissions in JWT.

## UI — Barcode Center

Route: **`/barcode-center`**

| Tab | Feature |
|-----|---------|
| Print | Multi-select products, copies, format |
| Batch | Print by category, print all active inventory |
| Reprint | Select rows from print history |
| Logs | Full print audit trail |
| Verify | Scan/type barcode — POS lookup + label validation |
| Calibrate | Test label `ABC-000001` for printer alignment |
| Diagnostics | Profile checks (DPI, quiet zones, Code128) |
| Queue | Job list, download output, cancel (manage) |

## API Endpoints

Base: `/api/barcode`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/templates` | view |
| GET | `/products` | view |
| POST | `/print/jobs` | print |
| GET | `/print/jobs` | view |
| GET | `/print/jobs/:id` | view |
| GET | `/print/jobs/:id/download` | print |
| POST | `/print/jobs/:id/cancel` | manage |
| GET | `/print/logs` | view |
| POST | `/print/verify` | view |
| POST | `/print/validate` | view |
| POST | `/print/calibration` | print |
| GET | `/print/diagnostics?profile=zebra` | view |

### Create print job body

```json
{
  "source": "batch",
  "productIds": ["..."],
  "categoryId": "...",
  "allInventory": true,
  "reprintLogIds": ["..."],
  "template": "50x25",
  "format": "pdf",
  "printerProfile": "zebra",
  "copiesPerLabel": 2
}
```

**Sources:** `single`, `batch`, `category`, `inventory`, `reprint`

## Label templates (mm)

| ID | Size |
|----|------|
| `25x15` | 25 × 15 |
| `40x20` | 40 × 20 |
| `50x25` | 50 × 25 (default) |
| `75x50` | 75 × 50 |

## Output formats

| Format | Use case |
|--------|----------|
| `pdf` | Browser print, office laser, batch sheets |
| `png` | JSON array of base64 images |
| `zpl` | Zebra thermal (ZPL II) |
| `tspl` | TSC / TVS-E thermal |

**Symbology:** Code128 only (unchanged from preview endpoint).

## Printer profiles (Phase 6)

| Profile | Manufacturer | Recommended format |
|---------|--------------|-------------------|
| `zebra` | Zebra | ZPL |
| `tsc` | TSC Auto ID | TSPL |
| `tvs` | TVS Electronics | TSPL |
| `generic` | Fallback | PDF |

Profiles set DPI (203 default), home offsets, and gap settings used by `labelRendererService.ts`.

## Models

### PrintJob (`printjobs`)

- `jobNumber` — `BPJ-000001`
- `status` — queued → processing → completed | failed | cancelled
- `source`, `productIds`, `template`, `format`, `printerProfile`, `copiesPerLabel`
- `outputPayload` — rendered batch (base64 PDF/PNG or plain ZPL/TSPL)

### BarcodePrintLog (`barcodeprintlogs`)

- One row per product per job (audit / reprint source)
- Links to `printJob`, optional `product`, `action` (print | reprint | calibration)

## Validation

`POST /barcode/print/validate` and scan verify return:

- Barcode width vs label usable area
- Quiet zone compliance (≥ 2mm target)
- Scanner readability flag

Run **Calibrate** tab before bulk thermal runs on a new printer.

## What is unchanged

- Product create barcode allocation (`BarcodeSequence`, category prefixes)
- Legacy `890…` barcodes and POS scan paths
- `GET /products/:id/barcode/preview` (single-product preview in edit drawer)
- `ProductBarcodeLabel` browser print on product edit

## Files added

**Backend**

- `src/models/PrintJob.ts`
- `src/models/BarcodePrintLog.ts`
- `src/services/labelRendererService.ts`
- `src/services/printerProfileService.ts`
- `src/services/barcodePrintService.ts`
- `src/controllers/barcodePrintController.ts`

**Frontend**

- `src/pages/BarcodeCenterPage.tsx`
- `src/lib/barcodePrint.ts`

## Deployment

1. Deploy backend (new collections created automatically on first write).
2. Deploy frontend.
3. Re-login so JWT includes `barcode:*` permissions.
