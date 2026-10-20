--[[
  Qsys Plugin Dev Tools - Runtime

  This file is pushed as-is to a Text Controller during development (see index.js)
  and compiled into the plugin's "if Controls then" block for release.
]]

rapidjson = require("rapidjson")

--------------------Variables/Constants/Timers--------------------

DebugLevel = Properties["Debug Print"].Value

StatusCodes = {
  OK = 0,
  Compromised = 1,
  Fault = 2,
  NotPresent = 3,
  Missing = 4,
  Initializing = 5
}

-------------------------Functions-------------------------
function Initialization()
  print(PluginInfo.Name .. " v" .. PluginInfo.Version .. " starting")
  SetStatus(StatusCodes.OK, "Running")
end

-- Prints when the "Debug Print" property includes the given direction ("Tx" or "Rx")
function DebugPrint(direction, msg)
  if DebugLevel == "All" or DebugLevel == direction then
    print("[" .. direction .. "] " .. msg)
  end
end

function SetStatus(code, msg)
  Controls.Status.Value = code
  Controls.Status.String = msg or ""
end

-- User helper functions
function GetIdx(tbl,ctl)
  for i,v in ipairs(tbl) do
    if v == ctl then
      return i
    end
  end
end

function funcInterlock(Array,ActiveCtl)
  for k,v in ipairs(Array) do
    v.Boolean = (k == ActiveCtl)
  end
end

function funcDeselect(Array)
  for k,v in ipairs(Array) do
    v.Boolean = false
  end
end

function allFalse(ctl)
  for i,v in pairs(ctl) do
    if v.Boolean == true then return false end
  end
  return true
end

function IsItEven(val)
  if(val%2 == 0) then return true else return false end
end

function WhichisTrue(ctl)
  for i,v in pairs(ctl) do
    if v.Boolean == true then return i end
  end
end

function WhichisFalse(ctl)
  for i,v in pairs(ctl) do
    if v.Boolean == false then return i end
  end
end

function  IsStringNil(ctl)
  for i,v in pairs(ctl) do
    if v.String == nil then return false end
  end
  return true
end

function SaveBoolean(ctl,tbl)
  for i,v in ipairs (ctl) do
    tbl[i] = v.Boolean
  end
  print("Boolean saved to table",rapidjson.encode(tbl,{pretty = true, sort_keys = sort}))
end

function RecallBoolean(ctl,tbl)
  for i,v in ipairs (ctl) do
    v.Boolean = tbl[i]
  end
   print("Boolean recalled from table",rapidjson.encode(tbl,{pretty = true, sort_keys = sort}))
end

function hex2str(str)
  return str:gsub(".",
    function(byte)
      return string.format("%02X", string.byte(byte))
    end
  )
end

function str2hex(str)
  return str:gsub("..",
    function(byte)
      return string.char( tonumber(byte,16) )
    end
  )
end

--------------------------Events---------------------------

-----------------------Initialization----------------------
Initialization()
