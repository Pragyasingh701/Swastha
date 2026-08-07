import supabase from '../config/supabase.js';

const REPORTS_TABLE = process.env.REPORTS_TABLE_NAME || 'reports';
const REPORTS_USER_ID_COLUMN = process.env.REPORTS_USER_ID_COLUMN || 'user_id';

function normalizeReport(row) {
  if (!row) return null;
  const userIdFromRow = row[REPORTS_USER_ID_COLUMN] ?? row.user_id ?? row.userId ?? null;

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
    notes: row.notes,
    fileUrl: row.file_url || null,
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
    notes: String(reportData.notes || '').trim() || null,
    file_url: reportData.fileUrl || null,
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
