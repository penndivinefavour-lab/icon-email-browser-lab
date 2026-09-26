/**
 * CSV Import/Export Utilities
 */

import type { Identity } from '@database/index';

export interface CSVIdentityRow {
  email: string;
  display_name?: string;
  provider?: string;
  status?: string;
  tags?: string;
  notes?: string;
  source?: string;
  verification_status?: string;
}

export function exportIdentitiesToCSV(identities: Identity[]): string {
  const headers = [
    'id',
    'email',
    'display_name',
    'provider',
    'status',
    'tags',
    'notes',
    'created_at',
    'last_used_at',
    'verification_status',
    'source',
    'metadata',
  ];

  const rows = identities.map((id) => [
    id.id,
    escapeCSV(id.email),
    escapeCSV(id.display_name || ''),
    escapeCSV(id.provider),
    escapeCSV(id.status),
    escapeCSV(id.tags),
    escapeCSV(id.notes || ''),
    id.created_at,
    escapeCSV(id.last_used_at || ''),
    escapeCSV(id.verification_status),
    escapeCSV(id.source),
    escapeCSV(id.metadata),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function parseIdentityCSV(csvContent: string): CSVIdentityRow[] {
  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());

  const rows: CSVIdentityRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }

    // Validate required field
    if (!row.email) continue;

    rows.push({
      email: row.email,
      display_name: row.display_name,
      provider: row.provider || 'unknown',
      status: row.status || 'available',
      tags: row.tags || '[]',
      notes: row.notes,
      source: row.source || 'imported',
      verification_status: row.verification_status || 'unverified',
    });
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function generateTestIdentities(count: number): Omit<Identity, 'id' | 'created_at'>[] {
  const identities: Omit<Identity, 'id' | 'created_at'>[] = [];

  for (let i = 1; i <= count; i++) {
    const padded = String(i).padStart(6, '0');
    identities.push({
      email: `test-user-${padded}@example.test`,
      display_name: `Test User ${padded}`,
      provider: 'example.test',
      status: 'available',
      tags: JSON.stringify(['test', 'generated']),
      notes: `Local test identity generated for QA purposes`,
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'generated',
      metadata: JSON.stringify({ generated: true, sequence: i }),
    });
  }

  return identities;
}
