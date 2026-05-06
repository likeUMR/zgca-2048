export type BuildingIntroConfigItem = {
  id: string;
  description: string;
};

export const buildingIntroConfig: BuildingIntroConfigItem[] = [
  {
    id: "c1",
    description: "一栋空置的宿舍楼，或许是我一切开始的地方。"
  },
  {
    id: "c2",
    description: "24级学长的宿舍楼，第一届学生出没。"
  },
  {
    id: "c3",
    description: "25级学长的宿舍，旁边是下沉商业区。"
  },
  {
    id: "c5",
    description: "会议，行政，教师，台球桌，学院的心脏。"
  },
  {
    id: "c7",
    description: "新装修好的办公楼，一切等待你的揭晓。"
  },
  {
    id: "c8",
    description: "学服，舞蹈室，图书馆，健身房，是上工的好地方。"
  },
  {
    id: "c9",
    description: "最后一块拼图，教师的工位。"
  }
];

export const getBuildingIntro = (id: string) =>
  buildingIntroConfig.find((item) => item.id === id)?.description ?? "这里填写楼栋介绍。";
