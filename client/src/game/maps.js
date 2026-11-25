// Dữ liệu bản đồ phía client (giống hệt server/src/maps). Thêm bản đồ mới: thêm file JSON vào cả hai thư mục rồi khai báo ở đây.
import bridge from '../../assets/maps/bridge.json';
import giza from '../../assets/maps/giza.json';
import greatwall from '../../assets/maps/greatwall.json';
import hoguom from '../../assets/maps/hoguom.json';
import paris from '../../assets/maps/paris.json';
import rome from '../../assets/maps/rome.json';
import warehouse from '../../assets/maps/warehouse.json';

export const DEFAULT_MAP_ID = 'warehouse';
export const MAPS = { bridge, giza, greatwall, hoguom, paris, rome, warehouse };

export function getMapData(id) {
  return MAPS[id] || MAPS[DEFAULT_MAP_ID];
}
