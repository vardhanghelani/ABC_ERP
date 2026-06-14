import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api'
import type { User } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'

export default function UsersPage() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchApi<User[]>('/auth/users'),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Manage system users and roles" />

      <Card className="overflow-hidden">
        <DataTableWrapper loading={isLoading} empty={!isLoading && users.length === 0} emptyTitle="No users found">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={(u as User & { _id?: string })._id || u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><Badge variant="default" className="normal-case capitalize">{u.role.replace('_', ' ')}</Badge></TableCell>
                  <TableCell><Badge variant="success">Active</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableWrapper>
      </Card>
    </div>
  )
}
