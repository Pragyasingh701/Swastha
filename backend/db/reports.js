import supabase from '../config/supabase.js';

const REPORTS_TABLE = process.env.REPORTS_TABLE_NAME || 'reports';
// M5 (DB reorg, decision D8): reports.user_id was renamed to patient_id —
// the column now points at `patients`, not the removed shared `users`
// table. Every read/write in this file already goes through this constant,
// so this is the only line that needed to change here.
const REPORTS_USER_ID_COLUMN = process.env.REPORTS_USER_ID_COLUMN || 'patient_id';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function splitStoredNotes(value) {
  const raw = normalizeText(value);
  if (!raw) {
    return { notes: '', analysis: '' };
  }

  const marker = '\n\n[AI Analysis]\n';
  const markerIndex = raw.indexOf(marker);

  if (markerIndex === -1) {
    return { notes: raw, analysis: '' };
  }

  return {
    notes: raw.slice(0, markerIndex).trim(),
    analysis: raw.slice(markerIndex + marker.length).trim(),
  };
}

function buildStoredNotes(notes, analysis) {
  const baseNotes = normalizeText(notes);
  const analysisText = normalizeText(analysis);

  if (!analysisText) {
    return baseNotes || null;
  }

  return [baseNotes, `[AI Analysis]\n${analysisText}`].filter(Boolean).join('\n\n');
}

function normalizeReport(row) {
  if (!row) return null;
  const userIdFromRow = row[REPORTS_USER_ID_COLUMN] ?? row.user_id ?? row.userId ?? null;
  const { notes, analysis } = splitStoredNotes(row.notes);

  return {
    id: row.id,
    user_id: userIdFromRow,
    title: row.title,
    doctor: row.doctor,
    hospital: row.hospital,
    category: row.category,
    reportDate: row.report_date,
    diagnosis: row.diagnosis,
    medicines: row.medicines,
    notes,
    analysis,
    fileUrl: row.file_url || null,
    unclearFields: Array.isArray(row.unclear_fields) ? row.unclear_fields : [],
    source: row.source || 'manual',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function isValidDateValue(value) {
  const date = new Date(value);
  return value != null && !Number.isNaN(date.getTime());
}

function toISODate(value) {
  const date = new Date(value);
  return date.toISOString().slice(0, 10);
}

export const listTimelineReports = async (userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || !supabase) throw new Error('Missing userId or database client.');

  try {
    const { data, error } = await supabase
      .from(REPORTS_TABLE)
      .select('*')
      .eq(REPORTS_USER_ID_COLUMN, normalizedUserId)
      .order('report_date', { ascending: false });

    if (error) {
      throw error;
    }

    return (data || []).map(normalizeReport);
  } catch (err) {
    console.error('Supabase timeline reports query error:', err.message || err);
    throw err;
  }
};

export const getTimelineReport = async (userId, reportId) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedReportId = String(reportId || '').trim();
  if (!normalizedUserId || !normalizedReportId || !supabase) {
    throw new Error('Missing userId, reportId, or database client.');
  }

  try {
    const { data, error } = await supabase
      .from(REPORTS_TABLE)
      .select('*')
      .eq(REPORTS_USER_ID_COLUMN, normalizedUserId)
      .eq('id', normalizedReportId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return normalizeReport(data);
  } catch (err) {
    console.error('Supabase get timeline report error:', err.message || err);
    throw err;
  }
};

export const createTimelineReport = async (reportData) => {
  const normalizedUserId = String(reportData?.userId || '').trim();
  const reportDateValue = reportData?.reportDate || reportData?.date || null;

  if (!normalizedUserId || !isValidDateValue(reportDateValue) || !supabase) {
    throw new Error('Missing or invalid report data. Ensure userId is populated and reportDate is a valid date string.');
  }

  const payload = {
    [REPORTS_USER_ID_COLUMN]: normalizedUserId,
    title: String(reportData.title || '').trim(),
    doctor: String(reportData.doctor || '').trim(),
    hospital: String(reportData.hospital || '').trim(),
    category: String(reportData.category || '').trim(),
    report_date: toISODate(reportDateValue),
    diagnosis: String(reportData.diagnosis || '').trim(),
    medicines: String(reportData.medicines || '').trim(),
    notes: buildStoredNotes(reportData.notes, reportData.analysis),
    file_url: reportData.fileUrl || null,
    unclear_fields: Array.isArray(reportData.unclearFields) ? reportData.unclearFields : [],
    source: reportData.source || 'manual',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from(REPORTS_TABLE)
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return normalizeReport(data);
  } catch (err) {
    console.error('Supabase create timeline report error:', err.message || err);
    throw err;
  }
};

export const updateTimelineReport = async (userId, reportId, reportData) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedReportId = String(reportId || '').trim();
  const reportDateValue = reportData?.reportDate || reportData?.date || null;

  if (!normalizedUserId || !normalizedReportId || !isValidDateValue(reportDateValue) || !supabase) {
    throw new Error('Missing userId, reportId, database client, or invalid report data.');
  }

  const payload = {
    title: String(reportData.title || '').trim(),
    doctor: String(reportData.doctor || '').trim(),
    hospital: String(reportData.hospital || '').trim(),
    category: String(reportData.category || '').trim(),
    report_date: toISODate(reportDateValue),
    diagnosis: String(reportData.diagnosis || '').trim(),
    medicines: String(reportData.medicines || '').trim(),
    notes: buildStoredNotes(reportData.notes, reportData.analysis),
    file_url: reportData.fileUrl || null,
    unclear_fields: Array.isArray(reportData.unclearFields) ? reportData.unclearFields : [],
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from(REPORTS_TABLE)
      .update(payload)
      // Scoped by user_id, same as delete — a user can only ever edit
      // their own reports, never someone else's by guessing an id.
      .eq(REPORTS_USER_ID_COLUMN, normalizedUserId)
      .eq('id', normalizedReportId)
      .select('*')
      .single();

    if (error) {
      // PGRST116 = .single() matched zero rows — either the id doesn't
      // exist, or it belongs to a different user. Treat both as "not
      // found" rather than a server error, and don't distinguish between
      // them in the response (that would leak which ids exist).
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return normalizeReport(data);
  } catch (err) {
    console.error('Supabase update timeline report error:', err.message || err);
    throw err;
  }
};

export const deleteTimelineReport = async (userId, reportId) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedReportId = String(reportId || '').trim();

  if (!normalizedUserId || !normalizedReportId || !supabase) {
    throw new Error('Missing userId, reportId, or database client.');
  }

  try {
    const { data, error } = await supabase
      .from(REPORTS_TABLE)
      .delete()
      .eq(REPORTS_USER_ID_COLUMN, normalizedUserId)
      .eq('id', normalizedReportId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return normalizeReport(data);
  } catch (err) {
    console.error('Supabase delete timeline report error:', err.message || err);
    throw err;
  }
};

export const deleteAllReportsForUser = async (userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || !supabase) return 0;

  try {
    const { data, error } = await supabase
      .from(REPORTS_TABLE)
      .delete()
      .eq(REPORTS_USER_ID_COLUMN, normalizedUserId)
      .select('id');

    if (error) {
      throw error;
    }

    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    console.error('Supabase delete all reports for user error:', err.message || err);
    throw err;
  }
};
