import * as XLSX from 'xlsx';
import { downloadBlob } from './api';
import { csvOf, exportRows, type CTask } from '../tasks';

/** CSV / Excel export happens in the browser: a normal Blob download, no server involved. */
export function exportTasksFile(list: CTask[], fmt: 'csv' | 'xlsx', today: string): string {
  const aoa = exportRows(list, today);
  if (fmt === 'csv') {
    const name = `production-tasks-${today}.csv`;
    downloadBlob(name, new Blob(['﻿' + csvOf(aoa)], { type: 'text/csv;charset=utf-8' }));
    return name;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Tasks');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const name = `production-tasks-${today}.xlsx`;
  downloadBlob(name, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  return name;
}

export function exportCsvRows(name: string, aoa: unknown[][]) {
  downloadBlob(name, new Blob(['﻿' + csvOf(aoa)], { type: 'text/csv;charset=utf-8' }));
}
