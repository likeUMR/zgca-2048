export type BuildingConfigItem = {
  id: string;
  level: number;
  name: string;
  title: string;
  icon: string;
  lockedIcon: string;
  isProgressNode: boolean;
};

export const buildingConfig: BuildingConfigItem[] = [
  {
    id: "c1",
    level: 2,
    name: "C1",
    title: "C1 教学楼",
    icon: "C1",
    lockedIcon: "?",
    isProgressNode: true
  },
  {
    id: "c2",
    level: 4,
    name: "C2",
    title: "C2 教学楼",
    icon: "C2",
    lockedIcon: "?",
    isProgressNode: true
  },
  {
    id: "c3",
    level: 8,
    name: "C3",
    title: "C3 教学楼",
    icon: "C3",
    lockedIcon: "?",
    isProgressNode: true
  },
  {
    id: "c5",
    level: 16,
    name: "C5",
    title: "C5 教学楼",
    icon: "C5",
    lockedIcon: "?",
    isProgressNode: true
  },
  {
    id: "c7",
    level: 32,
    name: "C7",
    title: "C7 教学楼",
    icon: "C7",
    lockedIcon: "?",
    isProgressNode: true
  },
  {
    id: "c8",
    level: 64,
    name: "C8",
    title: "C8 教学楼",
    icon: "C8",
    lockedIcon: "?",
    isProgressNode: true
  },
  {
    id: "c9",
    level: 128,
    name: "C9",
    title: "C9 教学楼",
    icon: "C9",
    lockedIcon: "?",
    isProgressNode: true
  }
];

export const progressNodes = buildingConfig.filter((item) => item.isProgressNode);
export const winLevel = 128;
