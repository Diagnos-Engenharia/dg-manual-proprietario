export type ClientUserRow = {
  id: string
  userId: string | null
  name: string
  email: string
  unitId: string
  unitLabel: string
  developmentId: string
  developmentName: string
  status: "pending" | "active" | "disabled"
  createdAt: string
}

export type ClientAdminData = {
  organizationId: string
  clients: ClientUserRow[]
  developments: { id: string; name: string }[]
  units: { id: string; developmentId: string; label: string }[]
  organizationName: string
}

export type ClientManual = {
  id: string
  filename: string
  revision: number
  pages: number
  manualType: "proprietario" | "acabamentos"
  publishedAt: string
  downloadUrl: string
}

export type ClientPortalData = {
  userName: string
  accesses: {
    id: string
    organizationName: string
    developmentName: string
    unitLabel: string
    manuals: ClientManual[]
  }[]
}

export type ClientActionResult<T = undefined> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string }
