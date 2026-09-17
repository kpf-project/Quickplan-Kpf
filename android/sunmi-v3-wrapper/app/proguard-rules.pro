# Keep Javascript bridge methods.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
