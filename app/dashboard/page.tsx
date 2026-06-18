import { deleteProjectById, duplicateProjectById, editProjectById, getAllPlaygroundForUser } from "@/modules/dashboard/actions";
import { currentUser, getUserById } from "@/modules/auth/actions";
import DashboardContent from "@/modules/dashboard/components/dashboard-content";
import React from "react";

const Page = async () => {
  const [playgrounds, sessionUser] = await Promise.all([
    getAllPlaygroundForUser(),
    currentUser(),
  ]);

  let user = null;
  if (sessionUser?.id) {
    user = await getUserById(sessionUser.id);
  }

  const finalUser = user ? {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    createdAt: user.createdAt,
    accounts: user.accounts.map(acc => ({
      provider: acc.provider
    }))
  } : (sessionUser ? {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
    image: sessionUser.image,
    role: sessionUser.role,
    createdAt: sessionUser.createdAt,
    accounts: [] as { provider: string }[]
  } : null);

  return (
    <DashboardContent
      user={finalUser}
      projects={playgrounds || []}
      onDeleteProject={deleteProjectById}
      onUpdateProject={editProjectById}
      onDuplicateProject={duplicateProjectById}
    />
  );
};

export default Page;
