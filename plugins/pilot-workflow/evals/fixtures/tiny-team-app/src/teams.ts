export interface Team {
  id: string;
  ownerId: string;
  memberIds: string[];
}

export function canManageTeam(team: Team, userId: string): boolean {
  return team.ownerId === userId;
}
