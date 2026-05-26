import { f as apiFetch } from "./router-DbOKu9BE.js";
async function listDevices() {
  return apiFetch("/api/devices");
}
async function createDevice(input) {
  return apiFetch("/api/devices", { method: "POST", json: input });
}
async function updateDevice(id, input) {
  return apiFetch(`/api/devices/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: input
  });
}
async function deleteDevice(id) {
  return apiFetch(`/api/devices/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}
export {
  createDevice as c,
  deleteDevice as d,
  listDevices as l,
  updateDevice as u
};
