function timezoneError(value) {
    if (!value) return 'Nhập múi giờ của nhà xưởng.';
    try {
        new Intl.DateTimeFormat('vi', { timeZone: value });
        return undefined;
    } catch (error) {
        if (error instanceof RangeError) return 'Múi giờ không hợp lệ. Ví dụ: Asia/Ho_Chi_Minh.';
        throw error;
    }
}

export function prepareFactoryForm(form) {
    const value = {
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        timezone: form.timezone.trim(),
    };
    const errors = Object.fromEntries(
        [
            [
                'code',
                !value.code
                    ? 'Nhập mã nhà xưởng.'
                    : value.code.length > 80
                      ? 'Mã nhà xưởng tối đa 80 ký tự.'
                      : undefined,
            ],
            [
                'name',
                !value.name
                    ? 'Nhập tên nhà xưởng.'
                    : value.name.length > 200
                      ? 'Tên nhà xưởng tối đa 200 ký tự.'
                      : undefined,
            ],
            ['timezone', timezoneError(value.timezone)],
        ].filter(([, message]) => message),
    );
    return { value, errors };
}
