"""7-in-1 soil NPK sensor over RS485 Modbus RTU (USB adapter).

Register map (holding registers, slave address 2, baud 9600):
  0x0000 moisture, 0x0001 temperature, 0x0002 EC, 0x0003 pH,
  0x0004 N, 0x0005 P, 0x0006 K.

Moisture, temperature, and pH use the common 0.1-unit encoding (divide by
10). Temperature is treated as signed. EC is µS/cm as-is; N/P/K are mg/kg
as-is. Confirm against the probe manual if readings look scaled wrong.
"""

from __future__ import annotations

import logging
import time
from inspect import signature

from sensors.base import NpkReading

logger = logging.getLogger("dirt-signal.collector.npk")

_RETRY_DELAY_S = 1.0
_DEFAULT_PORT = "/dev/ttyUSB0"
_DEFAULT_BAUD = 9600
_DEFAULT_SLAVE = 2
_REGISTER_START = 0x0000
_REGISTER_COUNT = 7

try:
    from pymodbus.client import ModbusSerialClient
except ImportError:  # pymodbus 2.x
    from pymodbus.client.sync import ModbusSerialClient


class Rs485NpkSensor:
    def __init__(
        self,
        *,
        port: str = _DEFAULT_PORT,
        baudrate: int = _DEFAULT_BAUD,
        slave: int = _DEFAULT_SLAVE,
    ) -> None:
        self._port = port
        self._slave = slave
        self._client = ModbusSerialClient(
            port=port,
            baudrate=baudrate,
            bytesize=8,
            parity="N",
            stopbits=1,
            timeout=1,
        )
        self._ensure_connected()

    def read(self) -> NpkReading:
        try:
            return self._read_once()
        except Exception as first_exc:
            logger.warning(
                "NPK Modbus read failed (%s); retrying once",
                first_exc,
            )
            time.sleep(_RETRY_DELAY_S)
            try:
                return self._read_once()
            except Exception as exc:
                logger.warning(
                    "NPK Modbus read failed after retry: %s",
                    exc,
                )
                raise

    def _ensure_connected(self) -> None:
        connected = getattr(self._client, "connected", False)
        if connected:
            return
        ok = self._client.connect()
        if not ok:
            raise RuntimeError(
                f"Failed to open NPK RS485 adapter at {self._port}"
            )

    def _read_holding(self, address: int, count: int):
        # pymodbus 3.10+ device_id; 3.0–3.9 slave (plus **kwargs, so
        # passing device_id would be silently ignored); 2.x unit=.
        read = self._client.read_holding_registers
        params = signature(read).parameters
        if "device_id" in params:
            return read(address=address, count=count, device_id=self._slave)
        if "slave" in params:
            return read(address=address, count=count, slave=self._slave)
        return read(address, count, unit=self._slave)

    def _read_once(self) -> NpkReading:
        self._ensure_connected()
        result = self._read_holding(_REGISTER_START, _REGISTER_COUNT)
        if result is None or result.isError():
            raise RuntimeError(f"NPK Modbus read error: {result}")
        registers = list(result.registers or [])
        if len(registers) < _REGISTER_COUNT:
            raise RuntimeError(
                f"NPK Modbus expected {_REGISTER_COUNT} registers, "
                f"got {len(registers)}"
            )
        reading = _decode_registers(registers)
        logger.info(
            "NPK decoded: moisture=%.1f%% temp=%.1f°C EC=%s µS/cm "
            "pH=%.1f N=%s P=%s K=%s mg/kg",
            reading.moisture_pct,
            reading.temp_c,
            reading.ec_us_cm,
            reading.ph,
            reading.n_est,
            reading.p_est,
            reading.k_est,
        )
        return reading


def _u16(registers: list[int], index: int) -> int:
    return int(registers[index]) & 0xFFFF


def _deci(registers: list[int], index: int, *, signed: bool = False) -> float:
    raw = _u16(registers, index)
    if signed and raw > 0x7FFF:
        raw -= 0x10000
    return raw / 10.0


def _decode_registers(registers: list[int]) -> NpkReading:
    return NpkReading(
        moisture_pct=round(_deci(registers, 0), 2),
        temp_c=round(_deci(registers, 1, signed=True), 1),
        ec_us_cm=_u16(registers, 2),
        ph=round(_deci(registers, 3), 2),
        n_est=_u16(registers, 4),
        p_est=_u16(registers, 5),
        k_est=_u16(registers, 6),
    )
