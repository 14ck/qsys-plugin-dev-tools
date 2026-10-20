-- Plugin identity. QDS reads Version; the compiler auto-increments BuildVersion.
-- `npm run init` replaces the all-zeros template Id with a fresh GUID. Keep it fixed after that so existing designs
-- recognize upgraded builds.
PluginInfo = {
  Name = "Manufacturer~Qsys Plugin Dev Tools",
  Version = "0.1",
  BuildVersion = "0.1.0.0",
  Id = "00000000-0000-0000-0000-000000000000",
  Author = "Jack Becerra",
  Manufacturer = "Manufacturer",
  Description = "Qsys Plugin Dev Tools"
}
