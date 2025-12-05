# Admin Roles Settings Integration

## Overview

This document describes how to integrate the Admin Roles management feature into the Bobby The Bot website settings page. Admin roles allow server owners to configure which Discord roles have administrative permissions for bot commands.

---

## API Endpoints

Base URL: `{BOT_API_URL}` (e.g., `https://api.bobbythebot.com` or `http://localhost:3003`)

### Authentication

All endpoints require authentication via one of:
- Header: `X-API-Key: {SETTINGS_API_KEY}`
- Header: `Authorization: Bearer {SETTINGS_API_KEY}`

---

### 1. Get Current Admin Roles

**Endpoint:** `GET /api/settings/:guildId/admin-roles`

**Response:**
```json
{
  "success": true,
  "guildId": "701234567890123456",
  "adminRoles": [
    {
      "id": "701309444562092113",
      "name": "Moderator",
      "color": "#3498db"
    },
    {
      "id": "701309444562092114",
      "name": "Admin",
      "color": "#e74c3c"
    }
  ],
  "adminRoleIds": ["701309444562092113", "701309444562092114"]
}
```

---

### 2. Get Available Roles (for dropdown)

**Endpoint:** `GET /api/settings/:guildId/available-roles`

**Response:**
```json
{
  "success": true,
  "guildId": "701234567890123456",
  "roles": [
    {
      "id": "701309444562092113",
      "name": "Admin",
      "color": "#e74c3c",
      "position": 10
    },
    {
      "id": "701309444562092114",
      "name": "Moderator",
      "color": "#3498db",
      "position": 8
    },
    {
      "id": "701309444562092115",
      "name": "Member",
      "color": "#95a5a6",
      "position": 1
    }
  ]
}
```

**Notes:**
- Roles are sorted by position (highest first)
- Managed roles (bot roles) and @everyone are excluded

---

### 3. Add an Admin Role

**Endpoint:** `POST /api/settings/:guildId/admin-roles`

**Request Body:**
```json
{
  "roleId": "701309444562092113"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Admin role added",
  "adminRoles": ["701309444562092113"]
}
```

**Error Response (role already exists):**
```json
{
  "success": false,
  "error": "Role is already an admin role"
}
```

---

### 4. Remove an Admin Role

**Endpoint:** `DELETE /api/settings/:guildId/admin-roles/:roleId`

**Success Response:**
```json
{
  "success": true,
  "message": "Admin role removed",
  "adminRoles": []
}
```

**Error Response (role not found):**
```json
{
  "success": false,
  "error": "Role is not an admin role"
}
```

---

## React Component Example

```tsx
// components/settings/AdminRolesSettings.tsx
import { useState, useEffect } from 'react';
import { useGuildSettings } from '@/hooks/useGuildSettings';

interface Role {
  id: string;
  name: string;
  color: string;
  position?: number;
}

interface AdminRolesSettingsProps {
  guildId: string;
}

export function AdminRolesSettings({ guildId }: AdminRolesSettingsProps) {
  const [adminRoles, setAdminRoles] = useState<Role[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current admin roles and available roles
  useEffect(() => {
    async function fetchRoles() {
      try {
        setLoading(true);

        const [adminRes, availableRes] = await Promise.all([
          fetch(`/api/bot/settings/${guildId}/admin-roles`),
          fetch(`/api/bot/settings/${guildId}/available-roles`),
        ]);

        const adminData = await adminRes.json();
        const availableData = await availableRes.json();

        if (adminData.success) {
          setAdminRoles(adminData.adminRoles);
        }
        if (availableData.success) {
          setAvailableRoles(availableData.roles);
        }
      } catch (err) {
        setError('Failed to load roles');
      } finally {
        setLoading(false);
      }
    }

    fetchRoles();
  }, [guildId]);

  // Add a role
  const handleAddRole = async () => {
    if (!selectedRole) return;

    try {
      const res = await fetch(`/api/bot/settings/${guildId}/admin-roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: selectedRole }),
      });

      const data = await res.json();

      if (data.success) {
        // Refresh the admin roles list
        const role = availableRoles.find(r => r.id === selectedRole);
        if (role) {
          setAdminRoles([...adminRoles, role]);
        }
        setSelectedRole('');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to add role');
    }
  };

  // Remove a role
  const handleRemoveRole = async (roleId: string) => {
    try {
      const res = await fetch(
        `/api/bot/settings/${guildId}/admin-roles/${roleId}`,
        { method: 'DELETE' }
      );

      const data = await res.json();

      if (data.success) {
        setAdminRoles(adminRoles.filter(r => r.id !== roleId));
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to remove role');
    }
  };

  // Filter out roles that are already admin roles
  const selectableRoles = availableRoles.filter(
    role => !adminRoles.some(ar => ar.id === role.id)
  );

  if (loading) {
    return <div className="animate-pulse">Loading roles...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">
          Admin Roles
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          Members with these roles can use administrative bot commands like
          !award, !clearhoney, !postadminbounty, and more.
        </p>
        <p className="text-yellow-500 text-sm mb-4">
          Note: Server owners and members with Discord Administrator permission
          always have admin access regardless of these settings.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-2 rounded">
          {error}
          <button onClick={() => setError(null)} className="ml-2">×</button>
        </div>
      )}

      {/* Current Admin Roles */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300">
          Current Admin Roles
        </label>

        {adminRoles.length === 0 ? (
          <p className="text-gray-500 italic">
            No admin roles configured. Only server owners and Discord
            Administrators can use admin commands.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {adminRoles.map(role => (
              <div
                key={role.id}
                className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-full"
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: role.color }}
                />
                <span className="text-white">{role.name}</span>
                <button
                  onClick={() => handleRemoveRole(role.id)}
                  className="text-gray-400 hover:text-red-400 ml-1"
                  title="Remove role"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Role */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300">
          Add Admin Role
        </label>
        <div className="flex gap-2">
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="flex-1 bg-gray-800 text-white border border-gray-700 rounded px-3 py-2"
          >
            <option value="">Select a role...</option>
            {selectableRoles.map(role => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddRole}
            disabled={!selectedRole}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700
                       disabled:cursor-not-allowed text-white px-4 py-2 rounded"
          >
            Add Role
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## UI/UX Guidelines

### Placement
Add the Admin Roles section to the Settings page, ideally in a "Permissions" or "Administration" category.

### Visual Design
- Display roles as colored pills/badges matching their Discord color
- Show a clear empty state when no roles are configured
- Include a warning note about server owners always having access

### Behavior
- Immediately update the UI after adding/removing roles (optimistic updates)
- Show loading states during API calls
- Display clear error messages if operations fail
- Filter the dropdown to only show roles not already selected

---

## Commands Affected by Admin Roles

The following commands require admin permissions:

| Command | Handler | Description |
|---------|---------|-------------|
| `!award` | eggbuckHandler | Award honey to a user |
| `!awardall` | eggbuckHandler | Award honey to all users |
| `!clearhoney` | eggbuckHandler | Reset all user balances |
| `!reset thinice` | thinIceHandler | Reset a user's thin ice status |
| `!postadminbounty` | bountyHandler | Post unlimited bounty |
| `!clearbounties` | bountyHandler | Clear all bounties |
| `!trivia` | triviaHandler | Manually trigger trivia |
| `!triviaanswer` | triviaHandler | Reveal trivia answer |
| `!triviacurrent` | triviaHandler | Show current question |

---

## Permission Logic

The `hasAdminPermission` function checks permissions in this order:

1. **Server Owner** → Always granted
2. **Discord Administrator** → Always granted
3. **Configured Admin Roles** → Check if user has any role in the `adminRoles` setting

```javascript
// utils/adminPermissions.js
async function hasAdminPermission(member, guildId) {
    // Always allow server owner
    if (member.id === member.guild.ownerId) return true;

    // Always allow Discord administrators
    if (member.permissions.has('Administrator')) return true;

    // Check configured admin roles
    const adminRoles = await getSetting(guildId, 'adminRoles', []);
    return member.roles.cache.some(role => adminRoles.includes(role.id));
}
```

---

## Data Storage

Admin roles are stored in the Convex `servers` table under the `settings` field:

```typescript
// Convex servers table
{
  guildId: "701234567890123456",
  settings: {
    adminRoles: ["role_id_1", "role_id_2"],
    // ... other settings
  }
}
```

---

## Migration Notes

### For Existing Servers
Servers without configured admin roles will only allow server owners and Discord Administrators to use admin commands. This is more restrictive than the previous "Top Egg" role behavior.

### Recommended Action
When users access the settings page for the first time after this update, consider:
1. Showing a notification about the new Admin Roles feature
2. Prompting them to configure their admin roles
3. Providing a "quick setup" option to migrate from the old system

---

## Testing Checklist

- [ ] Can view current admin roles
- [ ] Can add a new admin role
- [ ] Cannot add a role that's already an admin role
- [ ] Can remove an admin role
- [ ] Dropdown only shows roles not already selected
- [ ] Role colors display correctly
- [ ] Error states display properly
- [ ] Loading states work correctly
- [ ] Bot commands respect the new permission system
