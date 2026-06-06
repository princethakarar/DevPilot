import { deleteProjectById, duplicateProjectById, editProjectById, getAllPlaygroundForUser } from "@/modules/dashboard/actions";
import { currentUser } from "@/modules/auth/actions";
import DashboardContent from "@/modules/dashboard/components/dashboard-content";
import React from "react";

const Page = async () => {
  const [playgrounds, user] = await Promise.all([
    getAllPlaygroundForUser(),
    currentUser(),
  ]);

  return (
    <DashboardContent
      user={user ?? null}
      projects={playgrounds || []}
      onDeleteProject={deleteProjectById}
      onUpdateProject={editProjectById}
      onDuplicateProject={duplicateProjectById}
    />
  );
};

export default Page;
