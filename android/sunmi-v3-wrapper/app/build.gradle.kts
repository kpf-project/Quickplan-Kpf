plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.kpf.productionline.sunmiwrapper"
  compileSdk = 34

  defaultConfig {
    applicationId = "com.kpf.productionline.sunmiwrapper"
    minSdk = 24
    targetSdk = 34
    versionCode = 4
    versionName = "1.0.4"
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro"
      )
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }
}

dependencies {
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("com.google.android.material:material:1.12.0")

  implementation("com.sunmi:printerlibrary:1.0.18")
  implementation("com.github.mik3y:usb-serial-for-android:3.9.0")
}
