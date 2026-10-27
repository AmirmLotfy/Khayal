/** The stage and application share this moonlit cyanotype palette. */
export const palette = {
  night: 0x07182e,
  deep: 0x0d2543,
  water: 0x174266,
  ice: 0xdaf0ef,
  mist: 0x8db5c3,
  amber: 0xe9b96a,
  coral: 0xd89183,
  linen: 0x07182e,
  linenEdge: 0x174266,
  soot: 0xdaf0ef,
  madder: 0xd89183,
  indigo: 0x0d2543,
  saffron: 0xe9b96a,
  verdigris: 0x8db5c3,
  bone: 0xdaf0ef,
};
export const ink = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
