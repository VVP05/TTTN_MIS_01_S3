function getSemesterRegistrationRange(semester) {
    if (!semester?.registration_start_date || !semester?.registration_end_date) return null;

    const startDate = new Date(semester.registration_start_date);
    const endDate = new Date(semester.registration_end_date);
    const start = semester.registration_window_has_time
        ? startDate
        : new Date(`${startDate.toISOString().slice(0, 10)}T00:00:00+07:00`);
    const end = semester.registration_window_has_time
        ? endDate
        : new Date(`${endDate.toISOString().slice(0, 10)}T23:59:59.999+07:00`);

    return start <= end ? { start, end } : null;
}

module.exports = getSemesterRegistrationRange;
