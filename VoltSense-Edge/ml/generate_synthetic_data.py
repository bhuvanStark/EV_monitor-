import csv
import random
import os

def generate_telemetry_dataset(filename="battery_telemetry_dataset.csv", num_samples=1500):
    """
    Generates synthetic battery telemetry data with columns:
    voltage, current, temp, gyro, label (0: Healthy, 1: Stress, 2: Risk)
    
    Rules:
    - Healthy (0): Nominal voltage, low/normal temperature, low current, low gyro.
    - Stress (1): High current, elevated temperature, moderate gyro.
    - Risk (2): Critical temperature, critical current, critical voltage drop, or extreme gyro (fall/crash).
    """
    
    headers = ["voltage", "current", "temp", "gyro", "label"]
    data = []
    
    # 0 = Healthy, 1 = Stress, 2 = Risk
    classes = [0, 1, 2]
    
    for _ in range(num_samples):
        # Determine which class to generate to ensure balance
        lbl = random.choice(classes)
        
        if lbl == 0:  # Healthy
            voltage = round(random.uniform(3.7, 4.2), 2)
            current = round(random.uniform(0.1, 2.5), 2)
            temp = round(random.uniform(22.0, 37.9), 2)
            gyro = round(random.uniform(0.0, 39.9), 2)
            
        elif lbl == 1:  # Stress
            # Elevated state triggers Stress
            trigger = random.choice(["current", "temp", "gyro", "voltage"])
            
            if trigger == "current":
                voltage = round(random.uniform(3.5, 3.8), 2)
                current = round(random.uniform(3.0, 5.9), 2)
                temp = round(random.uniform(30.0, 44.9), 2)
                gyro = round(random.uniform(10.0, 79.9), 2)
            elif trigger == "temp":
                voltage = round(random.uniform(3.5, 3.9), 2)
                current = round(random.uniform(1.0, 4.0), 2)
                temp = round(random.uniform(38.0, 47.9), 2)
                gyro = round(random.uniform(5.0, 60.0), 2)
            elif trigger == "gyro":
                voltage = round(random.uniform(3.6, 4.0), 2)
                current = round(random.uniform(0.5, 3.5), 2)
                temp = round(random.uniform(25.0, 40.0), 2)
                gyro = round(random.uniform(40.0, 119.9), 2)
            else: # low voltage under load
                voltage = round(random.uniform(3.3, 3.59), 2)
                current = round(random.uniform(2.0, 5.0), 2)
                temp = round(random.uniform(35.0, 45.0), 2)
                gyro = round(random.uniform(10.0, 70.0), 2)
                
        else:  # Risk
            # Critical state triggers Risk
            trigger = random.choice(["critical_voltage", "critical_current", "critical_temp", "critical_gyro"])
            
            if trigger == "critical_voltage":
                voltage = round(random.uniform(2.8, 3.29), 2)
                current = round(random.uniform(1.0, 8.0), 2)
                temp = round(random.uniform(25.0, 55.0), 2)
                gyro = round(random.uniform(0.0, 150.0), 2)
            elif trigger == "critical_current":
                voltage = round(random.uniform(3.0, 3.6), 2)
                current = round(random.uniform(6.0, 12.0), 2) # Extreme draw
                temp = round(random.uniform(40.0, 58.0), 2)
                gyro = round(random.uniform(10.0, 180.0), 2)
            elif trigger == "critical_temp":
                voltage = round(random.uniform(3.1, 4.0), 2)
                current = round(random.uniform(1.0, 7.0), 2)
                temp = round(random.uniform(48.0, 65.0), 2) # Thermal runaway risk
                gyro = round(random.uniform(5.0, 120.0), 2)
            else: # critical_gyro
                voltage = round(random.uniform(3.4, 4.1), 2)
                current = round(random.uniform(0.5, 4.0), 2)
                temp = round(random.uniform(22.0, 42.0), 2)
                gyro = round(random.uniform(120.0, 250.0), 2) # Fall / Crash / Extreme vibration
                
        data.append([voltage, current, temp, gyro, lbl])
        
    # Write to CSV
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, mode='w', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(headers)
        writer.writerows(data)
        
    print(f"✅ Telemetry dataset created successfully at '{filename}' with {num_samples} samples.")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(script_dir, "battery_telemetry_dataset.csv")
    generate_telemetry_dataset(csv_path, 1500)
