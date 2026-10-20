--[[
  Dev shim - DO NOT include in the plugin build.

  Text Controllers have no Properties table. index.js prepends plugin/info.lua
  and this file to plugin/runtime.lua before pushing to the Text Controller,
  so runtime.lua can run unchanged. Keep these keys in sync with properties.lua.
]]

Properties = Properties or {
  ["Debug Print"] = { Value = "All" },
}
