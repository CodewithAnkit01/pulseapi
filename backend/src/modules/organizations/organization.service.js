import prisma from "../../config/database.js";

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  createdAt: true,
  updatedAt: true,
};

export const createOrganization = async (userId, data) => {
  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
      },
      select: organizationSelect,
    });

    const membership = await tx.membership.create({
      data: {
        userId,
        organizationId: organization.id,
        role: "OWNER",
      },
      select: {
        id: true,
        role: true,
        createdAt: true,
      },
    });

    return {
      organization,
      membership,
    };
  });
};


export const listUserOrganizations = async (userId)=>{
    const memberships = await prisma.membership.findMany({
        where:{userId},
        orderBy:{createdAt:"desc"},
        select:{
            role:true,
            createdAt:true,
            organization:{
                select:organizationSelect
            }
        }
    });

    return memberships.map((membership)=>({
        ...membership.organization,
        membershipRole: membership.role,
    joinedAt: membership.createdAt,
        
    }))
}


export const updateOrganization = async (
  organizationId,
  data,
) => {
  return prisma.organization.update({
    where: { id: organizationId },
    data,
    select: organizationSelect,
  });
};
