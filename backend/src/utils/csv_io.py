"""CSV file I/O utilities for upload endpoints."""

from fastapi import UploadFile

MAX_CSV_BYTES = 5 * 1024 * 1024  # 5 MB


async def read_csv_upload(file: UploadFile) -> str:
    """Read and decode an uploaded CSV file.

    Enforces a size limit and handles UTF-8 BOM and GBK encoding fallback
    for Chinese-locale Windows clients.

    Raises:
        ValueError: If the file is not CSV, exceeds the size limit, or
            cannot be decoded.
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise ValueError("File must be a CSV file")

    content = await file.read()
    if len(content) > MAX_CSV_BYTES:
        raise ValueError(f"檔案過大（上限 {MAX_CSV_BYTES // 1024 // 1024} MB）")

    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            return content.decode("gbk")
        except UnicodeDecodeError as e:
            raise ValueError("無法解析檔案編碼，請使用 UTF-8 格式儲存") from e
