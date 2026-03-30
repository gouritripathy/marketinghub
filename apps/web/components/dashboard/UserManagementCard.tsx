'use client';

import { Eye, EyeOff, PencilLine, RefreshCcw, Save, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { authClient, type UserRole } from '../../lib/auth/authClient';
import { useAuth } from '../../lib/auth/AuthProvider';

const inputClasses =
  'w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

const UserManagementCard = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<
    Array<{ id: string; name: string; email: string; role: UserRole; createdAt?: string }>
  >([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'MEMBER' as UserRole,
  });
  const [createPasswordVisible, setCreatePasswordVisible] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    role: 'MEMBER' as UserRole,
    password: '',
  });
  const [editPasswordVisible, setEditPasswordVisible] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (a.createdAt && b.createdAt) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return a.email.localeCompare(b.email);
      }),
    [users],
  );

  const loadUsers = async () => {
    if (!isAdmin) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const data = await authClient.listUsers();
      setUsers(data);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : 'Unable to load users.');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [isAdmin]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'Only admins can create users.' });
      return;
    }

    setCreateLoading(true);
    setMessage(null);
    try {
      const created = await authClient.createUser(form);
      setMessage({ type: 'success', text: `User created: ${created.email}` });
      setForm((prev) => ({ ...prev, name: '', email: '', password: '' }));
      await loadUsers();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unable to create user.',
      });
    } finally {
      setCreateLoading(false);
    }
  };

  const beginEdit = (target: { id: string; name: string; email: string; role: UserRole }) => {
    setEditUserId(target.id);
    setEditForm({
      name: target.name,
      email: target.email,
      role: target.role,
      password: '',
    });
    setEditPasswordVisible(false);
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditUserId(null);
    setEditForm({ name: '', email: '', role: 'MEMBER', password: '' });
    setEditPasswordVisible(false);
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin || !editUserId) return;

    setEditLoading(true);
    setMessage(null);
    try {
      const payload = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        password: editForm.password.trim() ? editForm.password : undefined,
      };
      const updated = await authClient.updateUser(editUserId, payload);
      setMessage({ type: 'success', text: `User updated: ${updated.email}` });
      cancelEdit();
      await loadUsers();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unable to update user.',
      });
    } finally {
      setEditLoading(false);
    }
  };

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
  };

  return (
    <div className="space-y-5">
      <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">User management</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-100">Create team member</h2>
            <p className="mt-1 text-sm text-slate-400">Onboard users with role-based access controls.</p>
          </div>
        </div>

        <form className="mt-4 space-y-3" onSubmit={submit}>
          <input
            className={inputClasses}
            placeholder="Full name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
            disabled={!isAdmin || createLoading}
          />
          <input
            className={inputClasses}
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            required
            disabled={!isAdmin || createLoading}
          />
          <div className="relative">
            <input
              className={`${inputClasses} pr-11`}
              type={createPasswordVisible ? 'text' : 'password'}
              placeholder="Temporary password (min 8 chars)"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              minLength={8}
              required
              disabled={!isAdmin || createLoading}
            />
            <button
              type="button"
              onClick={() => setCreatePasswordVisible((prev) => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-200"
              aria-label={createPasswordVisible ? 'Hide password' : 'Show password'}
              disabled={!isAdmin || createLoading}
            >
              {createPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <select
            className={inputClasses}
            value={form.role}
            onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as UserRole }))}
            disabled={!isAdmin || createLoading}
          >
            <option value="MEMBER">MEMBER</option>
            <option value="REVIEWER">REVIEWER</option>
            <option value="ADMIN">ADMIN</option>
          </select>

          <button
            type="submit"
            disabled={!isAdmin || createLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" />
            {createLoading ? 'Creating...' : 'Create user'}
          </button>
        </form>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Team users</h3>
            <p className="text-sm text-slate-400">View and edit current users.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={!isAdmin || usersLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {!isAdmin ? <p className="text-xs text-amber-300">Sign in as ADMIN to view and edit users.</p> : null}
        {usersError ? <p className="mt-2 text-xs text-rose-300">{usersError}</p> : null}
        {message ? (
          <p className={`mt-2 text-xs ${message.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>
            {message.text}
          </p>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((row) => (
                <tr key={row.id} className="border-b border-slate-900/80 text-slate-200">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.email}</td>
                  <td className="px-3 py-2">{row.role}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{formatDate(row.createdAt)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => beginEdit(row)}
                      disabled={!isAdmin}
                      className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {sortedUsers.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-sm text-slate-400" colSpan={5}>
                    {usersLoading ? 'Loading users...' : 'No users found.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      {editUserId ? (
        <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-lg font-semibold text-slate-100">Edit user</h3>
          <p className="mt-1 text-sm text-slate-400">Update profile details and optionally reset password.</p>
          <form className="mt-4 space-y-3" onSubmit={saveEdit}>
            <input
              className={inputClasses}
              placeholder="Full name"
              value={editForm.name}
              onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
              required
              disabled={editLoading}
            />
            <input
              className={inputClasses}
              type="email"
              placeholder="Email"
              value={editForm.email}
              onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
              required
              disabled={editLoading}
            />
            <select
              className={inputClasses}
              value={editForm.role}
              onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value as UserRole }))}
              disabled={editLoading}
            >
              <option value="MEMBER">MEMBER</option>
              <option value="REVIEWER">REVIEWER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <div className="relative">
              <input
                className={`${inputClasses} pr-11`}
                type={editPasswordVisible ? 'text' : 'password'}
                placeholder="Set new password (optional)"
                value={editForm.password}
                onChange={(event) => setEditForm((prev) => ({ ...prev, password: event.target.value }))}
                minLength={8}
                disabled={editLoading}
              />
              <button
                type="button"
                onClick={() => setEditPasswordVisible((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-200"
                aria-label={editPasswordVisible ? 'Hide password' : 'Show password'}
                disabled={editLoading}
              >
                {editPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={editLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {editLoading ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={editLoading}
                className="inline-flex items-center rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        </article>
      ) : null}
    </div>
  );
};

export default UserManagementCard;
