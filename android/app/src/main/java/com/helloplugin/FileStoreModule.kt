package com.helloplugin

import android.os.Environment
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * SuperFun — minimal persistent storage bridge.
 * Reads/writes plain text (JSON) files so game saves survive a full plugin
 * close. That is the only reason SuperFun ships native code.
 */
class FileStoreModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "FileStore"

  /** Absolute path of the shared external storage root (usually /storage/emulated/0). */
  @ReactMethod
  fun getExternalDir(promise: Promise) {
    try {
      promise.resolve(Environment.getExternalStorageDirectory().absolutePath)
    } catch (e: Exception) {
      promise.reject("EXT_DIR", e)
    }
  }

  /** Write `content` to `path`, creating parent directories as needed. */
  @ReactMethod
  fun writeText(path: String, content: String, promise: Promise) {
    try {
      val f = File(path)
      f.parentFile?.mkdirs()
      f.writeText(content)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WRITE", e)
    }
  }

  /** Read `path` as text; resolves "" if the file does not exist. */
  @ReactMethod
  fun readText(path: String, promise: Promise) {
    try {
      val f = File(path)
      promise.resolve(if (f.exists()) f.readText() else "")
    } catch (e: Exception) {
      promise.reject("READ", e)
    }
  }
}
