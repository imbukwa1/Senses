import { createUniver, LocaleType } from "@univerjs/presets";
import { UniverSheetsCoreWorkerPreset } from "@univerjs/preset-sheets-core/worker";
import { UniverSheetsAdvancedWorkerPreset } from "@univerjs/preset-sheets-advanced/worker";
import { UniverSheetsFilterWorkerPreset } from "@univerjs/preset-sheets-filter/worker";

createUniver({
  locale: LocaleType.EN_US,
  locales: {
    enUS: {},
  },
  presets: [
    UniverSheetsCoreWorkerPreset(),
    UniverSheetsAdvancedWorkerPreset(),
    UniverSheetsFilterWorkerPreset(),
  ],
});
