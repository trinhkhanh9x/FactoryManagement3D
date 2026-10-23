import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, InlineAlert, Modal, TextField } from '@openmes/ui';
import { CheckField } from './Fields';
import { errorText } from '../lib/api';
import { prepareFactoryForm } from '../lib/factoryForm';

const blank = () => ({
    code: '',
    name: '',
    timezone: 'Asia/Ho_Chi_Minh',
    is_active: true,
    line_ids: [],
});

export default function FactoryAdmin({ api, catalog, factory, onClose, onSaved }) {
    const formId = useId();
    const formRef = useRef(null);
    const [fieldErrors, setFieldErrors] = useState({});
    const [form, setForm] = useState(() =>
        factory
            ? {
                  code: factory.code,
                  name: factory.name,
                  timezone: factory.timezone,
                  is_active: factory.is_active,
                  line_ids: [...factory.line_ids],
              }
            : blank(),
    );
    const [members, setMembers] = useState([]);
    const [membersLoaded, setMembersLoaded] = useState(!factory);
    const [busy, setBusy] = useState(false),
        [error, setError] = useState(null),
        [changed, setChanged] = useState(false);
    const [savedFactoryId, setSavedFactoryId] = useState(factory?.id || null);
    const persistedFactory = useRef(null);
    useEffect(() => {
        if (!factory) return undefined;
        const controller = new AbortController();
        api(`/factories/${factory.id}/members`, { signal: controller.signal })
            .then((data) => {
                if (!controller.signal.aborted) {
                    setMembers(data.members);
                    setMembersLoaded(true);
                }
            })
            .catch((problem) => {
                if (!controller.signal.aborted) setError(problem);
            });
        return () => controller.abort();
    }, [api, factory]);
    const change = (key, value) => {
        setForm((current) => ({ ...current, [key]: value }));
        setFieldErrors((current) => ({ ...current, [key]: undefined }));
        setChanged(true);
    };
    const close = () => {
        if (!busy && (!changed || window.confirm('Thông tin nhà xưởng chưa lưu. Bỏ thay đổi?'))) {
            if (persistedFactory.current) onSaved(persistedFactory.current, false);
            onClose();
        }
    };
    const toggleMember = (userId, enabled) => {
        setChanged(true);
        setMembers((current) =>
            enabled
                ? [...current, { user_id: userId, can_edit_layout: false }]
                : current.filter((member) => member.user_id !== userId),
        );
    };
    async function save() {
        if (busy || !membersLoaded) return;
        const { value: cleaned, errors: validation } = prepareFactoryForm(form);
        setFieldErrors(validation);
        if (Object.keys(validation).length) {
            formRef.current?.querySelector(`[name="${Object.keys(validation)[0]}"]`)?.focus();
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const saved = await api(
                savedFactoryId ? `/factories/${savedFactoryId}` : '/factories',
                { method: savedFactoryId ? 'PATCH' : 'POST', body: cleaned },
            );
            setSavedFactoryId(saved.id);
            persistedFactory.current = saved;
            try {
                await api(`/factories/${saved.id}/members`, { method: 'PUT', body: { members } });
            } catch (problem) {
                // Factory and members are separate transactions; retain form with concrete saved ID.
                throw new Error(
                    `Thông tin xưởng đã lưu; phân quyền chưa lưu: ${errorText(problem)}. Đóng và mở lại cấu hình xưởng để thử lại.`,
                );
            }
            setChanged(false);
            onSaved(saved, true);
            onClose();
        } catch (problem) {
            setError(problem);
            setFieldErrors(
                Object.fromEntries(
                    Object.entries(problem.errors || {}).map(([key, messages]) => [
                        key,
                        Array.isArray(messages) ? messages.join(' ') : String(messages),
                    ]),
                ),
            );
        } finally {
            setBusy(false);
        }
    }
    const availableLines = catalog.lines.filter(
        (line) => line.factory_id == null || line.factory_id === factory?.id,
    );
    return (
        <Modal
            open
            onClose={close}
            title={factory ? 'Cấu hình nhà xưởng' : 'Tạo nhà xưởng'}
            closeLabel="Đóng cấu hình"
            width={700}
            footer={
                <>
                    <Button variant="ghost" onClick={close} disabled={busy}>
                        Hủy
                    </Button>
                    <Button type="submit" form={formId} loading={busy} disabled={!membersLoaded}>
                        Lưu cấu hình
                    </Button>
                </>
            }
        >
            <form
                id={formId}
                ref={formRef}
                className="fm3d-stack"
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}
            >
                {error && (
                    <InlineAlert severity="error" title="Chưa hoàn tất lưu cấu hình">
                        {errorText(error)}
                    </InlineAlert>
                )}
                <div className="fm3d-grid2">
                    <TextField
                        label="Mã nhà xưởng"
                        name="code"
                        value={form.code}
                        onChange={(value) => change('code', value)}
                        required
                        maxLength={80}
                        error={fieldErrors.code}
                    />
                    <TextField
                        label="Tên nhà xưởng"
                        name="name"
                        value={form.name}
                        onChange={(value) => change('name', value)}
                        required
                        maxLength={200}
                        error={fieldErrors.name}
                    />
                </div>
                <TextField
                    label="Múi giờ IANA"
                    name="timezone"
                    value={form.timezone}
                    onChange={(value) => change('timezone', value)}
                    hint="Ví dụ Asia/Ho_Chi_Minh"
                    required
                    error={fieldErrors.timezone}
                />
                <CheckField
                    label="Đang hoạt động"
                    checked={form.is_active}
                    onChange={(value) => change('is_active', value)}
                />
                <fieldset className="fm3d-fieldset">
                    <legend>Dây chuyền thuộc xưởng</legend>
                    {!availableLines.length && <p>Chưa có dây chuyền chưa phân công.</p>}
                    {availableLines.map((line) => (
                        <CheckField
                            key={line.id}
                            label={`${line.code} · ${line.name}`}
                            checked={form.line_ids.includes(line.id)}
                            onChange={(checked) =>
                                change(
                                    'line_ids',
                                    checked
                                        ? [...form.line_ids, line.id]
                                        : form.line_ids.filter((id) => id !== line.id),
                                )
                            }
                        />
                    ))}
                    <p className="fm3d-muted">
                        Máy kế thừa xưởng từ dây chuyền. Dây chuyền đã bố trí máy phải được xử lý
                        trước khi chuyển xưởng.
                    </p>
                </fieldset>
                <fieldset className="fm3d-fieldset">
                    <legend>Quản lý được phân công</legend>
                    {!membersLoaded && <p role="status">Đang tải phân quyền…</p>}
                    {catalog.users.map((user) => {
                        const member = members.find((item) => item.user_id === user.id);
                        return (
                            <div className="fm3d-member" key={user.id}>
                                <CheckField
                                    label={user.name}
                                    checked={!!member}
                                    disabled={!membersLoaded}
                                    onChange={(value) => toggleMember(user.id, value)}
                                />
                                <CheckField
                                    label="Chỉnh mặt bằng"
                                    checked={member?.can_edit_layout}
                                    disabled={!member || !membersLoaded}
                                    onChange={(value) => {
                                        setChanged(true);
                                        setMembers((current) =>
                                            current.map((item) =>
                                                item.user_id === user.id
                                                    ? { ...item, can_edit_layout: value }
                                                    : item,
                                            ),
                                        );
                                    }}
                                />
                            </div>
                        );
                    })}
                </fieldset>
            </form>
        </Modal>
    );
}
