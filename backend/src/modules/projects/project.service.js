import prisma from "../../config/database.js";

const projectSelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  environment: true,
  createdAt: true,
  updatedAt: true,
};

export const createProject = (organizationId, data)=>
    prisma.project.create({
        data:{
            organizationId,
        name: data.name,
        description: data.description,
        },
        select:projectSelect,
        
    });

    export const listProjects = (organizationId)=>
        prisma.project.findMany({
                where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: projectSelect,
        });

   export const getProject = (organizationId, projectId) =>
  prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: projectSelect,
  });

export const updateProject = (
  organizationId,
  projectId,
  data,
) =>
  prisma.project.updateMany({
    where: { id: projectId, organizationId },
    data,
  });

export const deleteProject = (organizationId, projectId) =>
  prisma.project.deleteMany({
    where: { id: projectId, organizationId },
  });     
    
